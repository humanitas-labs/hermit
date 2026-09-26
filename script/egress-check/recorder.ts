// Recording layer for the egress harness. Two independent capture paths:
//
// 1. Process level: a recording HTTP(S) proxy on loopback that the binary is
//    pointed at through HTTP_PROXY/HTTPS_PROXY. It records every absolute-form
//    request and every CONNECT attempt, scans headers and bodies for context
//    markers, and refuses everything except scripted MITM routes to the fake
//    TLS servers. Nothing is ever forwarded to the internet.
//
// 2. Namespace level: whatever ignores the proxy environment must still show
//    up. On Linux the harness runs inside `unshare -rnm` with every IPv4/IPv6
//    address routed to loopback, so a sink listener on 80/443 records the
//    original destination and a UDP resolver on :53 records DNS names. On
//    macOS the binary runs under `sandbox-exec` with non-loopback outbound and
//    the mDNSResponder socket denied; denials are read back from the unified
//    log with the process name, pid, and port.
//
// Every entry is an attempt. A refused CONNECT or a denied connect() counts.

import type { Socket } from "bun"

export type Destination = {
  ts: number
  layer: "proxy" | "dns" | "sink" | "sandbox"
  kind: "connect" | "request" | "query" | "deny"
  host: string
  port?: number
  method?: string
  path?: string
  headers?: string[]
  markers?: string[]
  process?: string
  pid?: number
  note?: string
}

export type Route = { host: string; port: number; target: number }

type Conn = {
  buf: Buffer
  mode: "head" | "body" | "tunnel" | "done"
  need: number
  chunked: boolean
  head?: { method: string; target: string; headers: Map<string, string>; raw: string }
  upstream?: Socket<{ client: Socket<Conn> }>
}

const BODY_CAP = 4 * 1024 * 1024

function parseHead(raw: string) {
  const lines = raw.split("\r\n")
  const [method = "", target = ""] = (lines[0] ?? "").split(" ")
  const headers = new Map<string, string>()
  lines.slice(1).forEach((line) => {
    const index = line.indexOf(":")
    if (index === -1) return
    headers.set(line.slice(0, index).trim().toLowerCase(), line.slice(index + 1).trim())
  })
  return { method, target, headers, raw }
}

function refuse(socket: Socket<Conn>, status = "403 Forbidden") {
  socket.write(`HTTP/1.1 ${status}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n`)
  socket.end()
  socket.data.mode = "done"
}

export function startProxy(input: { routes: Route[]; markers: string[]; record: (entry: Destination) => void }) {
  const routes = new Map(input.routes.map((route) => [`${route.host}:${route.port}`, route.target]))

  const finish = (socket: Socket<Conn>, bodyText: string) => {
    const head = socket.data.head
    if (!head) return refuse(socket)
    const url =
      head.target.startsWith("http://") || head.target.startsWith("https://") ? new URL(head.target) : undefined
    const host = url?.hostname ?? head.headers.get("host")?.split(":")[0] ?? "?"
    const port = url
      ? Number(url.port || (url.protocol === "https:" ? 443 : 80))
      : Number(head.headers.get("host")?.split(":")[1] ?? 80)
    const scan = head.raw + bodyText
    input.record({
      ts: Date.now(),
      layer: "proxy",
      kind: "request",
      host,
      port,
      method: head.method,
      path: url ? url.pathname : head.target,
      headers: [...head.headers.keys()],
      markers: input.markers.filter((m) => scan.includes(m)),
    })
    refuse(socket)
  }

  const server = Bun.listen<Conn>({
    hostname: "127.0.0.1",
    port: 0,
    socket: {
      open(socket) {
        socket.data = { buf: Buffer.alloc(0), mode: "head", need: 0, chunked: false }
      },
      data(socket, chunk) {
        const conn = socket.data
        if (conn.mode === "done") return
        if (conn.mode === "tunnel") {
          conn.upstream?.write(chunk)
          return
        }
        conn.buf = Buffer.concat([conn.buf, chunk])
        if (conn.mode === "head") {
          const end = conn.buf.indexOf("\r\n\r\n")
          if (end === -1) {
            if (conn.buf.length > 64 * 1024) refuse(socket, "431 Request Header Fields Too Large")
            return
          }
          const head = parseHead(conn.buf.subarray(0, end).toString("utf8"))
          conn.head = head
          const rest = conn.buf.subarray(end + 4)
          conn.buf = Buffer.from(rest)
          if (head.method === "CONNECT") {
            const [host = "?", portText = "443"] = head.target.split(":")
            const port = Number(portText)
            const target = routes.get(`${host}:${port}`)
            input.record({
              ts: Date.now(),
              layer: "proxy",
              kind: "connect",
              host,
              port,
              headers: [...head.headers.keys()],
              note: target ? `mitm -> 127.0.0.1:${target}` : "refused",
            })
            if (!target) return refuse(socket)
            conn.mode = "tunnel"
            const pending = conn.buf
            conn.buf = Buffer.alloc(0)
            Bun.connect<{ client: Socket<Conn> }>({
              hostname: "127.0.0.1",
              port: target,
              data: { client: socket },
              socket: {
                open(up) {
                  conn.upstream = up
                  socket.write("HTTP/1.1 200 Connection Established\r\n\r\n")
                  if (pending.length) up.write(pending)
                },
                data(up, data) {
                  up.data.client.write(data)
                },
                close(up) {
                  up.data.client.end()
                },
                error(up) {
                  up.data.client.end()
                },
              },
            }).catch(() => refuse(socket, "502 Bad Gateway"))
            return
          }
          const length = Number(head.headers.get("content-length") ?? 0)
          conn.chunked = (head.headers.get("transfer-encoding") ?? "").includes("chunked")
          conn.need = Number.isFinite(length) ? length : 0
          conn.mode = "body"
        }
        if (conn.mode !== "body") return
        const complete = conn.chunked
          ? conn.buf.includes("\r\n0\r\n\r\n") || conn.buf.length >= BODY_CAP
          : conn.buf.length >= Math.min(conn.need, BODY_CAP)
        if (!complete) return
        finish(socket, conn.buf.subarray(0, BODY_CAP).toString("utf8"))
      },
      close(socket) {
        socket.data.upstream?.end()
      },
      error(socket) {
        socket.data.upstream?.end()
      },
    },
  })
  return { port: server.port, url: `http://127.0.0.1:${server.port}`, stop: () => server.stop(true) }
}

// Minimal DNS responder: records every QNAME and answers NXDOMAIN so nothing
// resolves. Only usable where the harness controls /etc/resolv.conf (Linux
// namespace mode); macOS has no per-process resolver override without root.
export async function startDns(input: { port: number; record: (entry: Destination) => void }) {
  const socket = await Bun.udpSocket({
    hostname: "127.0.0.1",
    port: input.port,
    socket: {
      data(sock, data, port, address) {
        if (data.length < 12) return
        const labels: string[] = []
        let offset = 12
        while (offset < data.length) {
          const len = data[offset] ?? 0
          if (len === 0) {
            offset += 1
            break
          }
          labels.push(data.subarray(offset + 1, offset + 1 + len).toString("latin1"))
          offset += 1 + len
        }
        const question = data.subarray(12, Math.min(data.length, offset + 4))
        input.record({ ts: Date.now(), layer: "dns", kind: "query", host: labels.join(".") })
        const reply = Buffer.alloc(12 + question.length)
        data.copy(reply, 0, 0, 2)
        reply.writeUInt16BE(0x8183, 2)
        reply.writeUInt16BE(1, 4)
        question.copy(reply, 12)
        sock.send(reply, port, address)
      },
    },
  })
  return { port: socket.port, stop: () => socket.close() }
}

// Linux namespace mode: with `ip route add local 0.0.0.0/0 dev lo` every
// address is local, so a connect() to any IP on 80/443 lands here and the
// original destination is the socket's local address.
export function startSink(input: { ports: number[]; record: (entry: Destination) => void }) {
  const servers = input.ports.map((port) =>
    Bun.listen({
      hostname: "0.0.0.0",
      port,
      socket: {
        open(socket) {
          input.record({
            ts: Date.now(),
            layer: "sink",
            kind: "connect",
            host: socket.localAddress,
            port: socket.localPort,
            note: `from ${socket.remoteAddress}`,
          })
          socket.end()
        },
        data() {},
      },
    }),
  )
  return { stop: () => servers.forEach((server) => server.stop(true)) }
}

export type Isolation = "sandbox-exec" | "netns" | "none"

// A forbidden outbound connect or a system-resolver lookup kills the offending
// process with SIGKILL. The kill is the record: the unified log drops most
// sandbox denial reports (verified: curl's appear, python/bun/node's do not),
// so the harness treats "exited by SIGKILL" as the attempt and reads the log
// only as a best-effort supplement.
export const SANDBOX_PROFILE = [
  "(version 1)",
  "(allow default)",
  '(deny network-outbound (remote ip "*:*") (with send-signal SIGKILL))',
  '(allow network-outbound (remote ip "localhost:*"))',
  '(deny network-outbound (remote unix-socket (path-literal "/private/var/run/mDNSResponder")) (with send-signal SIGKILL))',
].join("")

export const SANDBOX_KILLED = "killed by sandbox-exec (SIGKILL): forbidden outbound connect or DNS lookup"

export function wrap(command: string[], isolation: Isolation) {
  if (isolation === "sandbox-exec") return ["/usr/bin/sandbox-exec", "-p", SANDBOX_PROFILE, ...command]
  return command
}

export function detectIsolation(requested?: string): Isolation {
  if (requested === "sandbox-exec" || requested === "netns" || requested === "none") return requested
  if (process.platform === "darwin") return "sandbox-exec"
  return "none"
}

function local(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

// macOS: read sandbox denials back from the unified log. The kernel masks the
// remote address (`remote:*:443`) but keeps the port, process, and pid; DNS
// attempts appear as denials of the mDNSResponder socket without the name.
export async function readSandboxLog(input: { start: Date; end: Date }): Promise<Destination[]> {
  const proc = Bun.spawn(
    [
      "/usr/bin/log",
      "show",
      "--start",
      local(new Date(input.start.getTime() - 1000)),
      "--end",
      local(new Date(input.end.getTime() + 2000)),
      "--style",
      "compact",
      "--predicate",
      'eventMessage CONTAINS "deny(1) network-outbound"',
    ],
    { stdout: "pipe", stderr: "pipe" },
  )
  const text = await new Response(proc.stdout).text()
  await proc.exited
  const pattern =
    /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3})\s+\S+\s+kernel\S*\s+\(Sandbox\)\s+(?:\d+ duplicate reports for )?Sandbox: (.+?)\((\d+)\) deny\(1\) network-outbound (.+)$/
  return text
    .split("\n")
    .map((line) => line.match(pattern))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => {
      const ts = new Date((m[1] ?? "").replace(" ", "T")).getTime()
      const target = (m[4] ?? "").trim()
      const dns = target.includes("mDNSResponder")
      const port = target.match(/:(\d+)$/)
      return {
        ts,
        layer: "sandbox" as const,
        kind: "deny" as const,
        host: dns ? "<dns lookup>" : "<masked by sandbox>",
        port: port ? Number(port[1]) : undefined,
        process: m[2],
        pid: Number(m[3]),
        note: `unified log: ${target}`,
      }
    })
    .filter((entry) => entry.ts >= input.start.getTime() - 1000 && entry.ts <= input.end.getTime() + 2000)
}
