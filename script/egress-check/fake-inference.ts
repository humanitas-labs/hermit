// Fake OpenAI-compatible inference server for the egress harness.
//
// Serves `POST <prefix>/chat/completions` on loopback, streams a scripted reply
// (text, tool calls, usage) as SSE, and records every request it receives:
// path, host header, header names, redacted header values, the model, the
// message count, and which synthetic context markers appear in the body.
// It never stores request bodies.
//
// Requests are classified by prompt content so one server can answer the
// primary turn, title generation, compaction, subagents, and agent generation
// with different scripted replies.
//
// Run standalone: `bun fake-inference.ts --port 0 --record out.jsonl`
// Or import `start()` from the harness.

import { appendFileSync } from "node:fs"

export type Usage = { input: number; output: number }

export type Reply =
  | { type: "text"; text: string; usage?: Usage }
  | { type: "tool"; name: string; args: Record<string, unknown>; text?: string; usage?: Usage }
  | { type: "abort"; text?: string }
  | { type: "redirect"; location: string }
  | { type: "error"; status: number; body?: string }

export type Script = {
  primary: Reply[]
  title?: Reply
  compaction?: Reply
  subagent?: Reply[]
  generate?: Reply
}

export type Kind = "primary" | "title" | "compaction" | "subagent" | "generate" | "other"

export type Entry = {
  ts: number
  server: string
  kind: Kind
  method: string
  path: string
  host: string
  headers: { [name: string]: string }
  model?: string
  stream: boolean
  messages: number
  tools: number
  markers: string[]
  bytes: number
  reply: Reply["type"] | "none"
}

export type Options = {
  name: string
  hostname?: string
  port?: number
  tls?: { cert: string; key: string }
  script: Script
  markers: string[]
  record: (entry: Entry) => void
}

const REDACTED = new Set(["authorization", "x-api-key", "api-key", "cookie", "proxy-authorization"])

// Header values are kept so the harness can scan them for session identifiers,
// except credentials, which are replaced by their length.
function headers(req: Request) {
  const out: { [name: string]: string } = {}
  req.headers.forEach((value, name) => {
    out[name] = REDACTED.has(name) ? `<redacted ${value.length} chars>` : value
  })
  return out
}

function classify(text: string, markers: { subagent: string }): Kind {
  if (text.includes("Generate a title for this conversation")) return "title"
  if (text.includes("context summarization agent")) return "compaction"
  if (text.includes("elite AI agent architect")) return "generate"
  if (text.includes(markers.subagent)) return "subagent"
  return "primary"
}

function sse(chunks: unknown[]) {
  return chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("") + "data: [DONE]\n\n"
}

function chunk(delta: { [key: string]: unknown }, extra: { [key: string]: unknown } = {}) {
  return {
    id: "chatcmpl-egress",
    object: "chat.completion.chunk",
    created: 0,
    model: "fake",
    choices: [{ index: 0, delta, finish_reason: null, ...extra }],
  }
}

function usageChunk(usage: Usage) {
  return {
    id: "chatcmpl-egress",
    object: "chat.completion.chunk",
    created: 0,
    model: "fake",
    choices: [],
    usage: { prompt_tokens: usage.input, completion_tokens: usage.output, total_tokens: usage.input + usage.output },
  }
}

function streamChunks(reply: Reply) {
  if (reply.type === "text") {
    return [
      chunk({ role: "assistant", content: "" }),
      chunk({ content: reply.text }),
      chunk({}, { finish_reason: "stop" }),
      usageChunk(reply.usage ?? { input: 20, output: 5 }),
    ]
  }
  if (reply.type === "tool") {
    return [
      chunk({ role: "assistant", content: reply.text ?? "" }),
      chunk({
        tool_calls: [{ index: 0, id: "call_egress_1", type: "function", function: { name: reply.name, arguments: "" } }],
      }),
      chunk({ tool_calls: [{ index: 0, function: { arguments: JSON.stringify(reply.args) } }] }),
      chunk({}, { finish_reason: "tool_calls" }),
      usageChunk(reply.usage ?? { input: 20, output: 10 }),
    ]
  }
  return []
}

function completion(reply: Reply) {
  const content = reply.type === "text" ? reply.text : ""
  const toolCalls =
    reply.type === "tool"
      ? [{ id: "call_egress_1", type: "function", function: { name: reply.name, arguments: JSON.stringify(reply.args) } }]
      : undefined
  const usage = reply.type === "text" || reply.type === "tool" ? (reply.usage ?? { input: 20, output: 5 }) : undefined
  return {
    id: "chatcmpl-egress",
    object: "chat.completion",
    created: 0,
    model: "fake",
    choices: [
      {
        index: 0,
        message: { role: "assistant", content, ...(toolCalls ? { tool_calls: toolCalls } : {}) },
        finish_reason: toolCalls ? "tool_calls" : "stop",
      },
    ],
    usage: usage
      ? { prompt_tokens: usage.input, completion_tokens: usage.output, total_tokens: usage.input + usage.output }
      : undefined,
  }
}

export function start(options: Options) {
  const counters = { primary: 0, subagent: 0 }
  const subagentMarker = options.markers.find((m) => m.startsWith("SUBAGENT-")) ?? "SUBAGENT-MARKER"
  const pick = (kind: Kind): Reply | undefined => {
    if (kind === "title") return options.script.title ?? { type: "text", text: "Egress check session" }
    if (kind === "compaction") return options.script.compaction ?? { type: "text", text: "Summary: egress check." }
    if (kind === "generate")
      return (
        options.script.generate ?? {
          type: "text",
          text: JSON.stringify({
            identifier: "egress-agent",
            whenToUse: "Use for egress checks.",
            systemPrompt: "You are the egress check agent.",
          }),
        }
      )
    if (kind === "subagent") {
      const list = options.script.subagent ?? [{ type: "text", text: "Subagent done." }]
      const reply = list[Math.min(counters.subagent, list.length - 1)]
      counters.subagent += 1
      return reply
    }
    const reply = options.script.primary[Math.min(counters.primary, options.script.primary.length - 1)]
    counters.primary += 1
    return reply
  }

  const server = Bun.serve({
    hostname: options.hostname ?? "127.0.0.1",
    port: options.port ?? 0,
    ...(options.tls ? { tls: { cert: Bun.file(options.tls.cert), key: Bun.file(options.tls.key) } } : {}),
    async fetch(req) {
      const url = new URL(req.url)
      const text = req.method === "POST" ? await req.text() : ""
      const body = (() => {
        if (!text) return undefined
        try {
          return JSON.parse(text) as { [key: string]: unknown }
        } catch {
          return undefined
        }
      })()
      const messages = Array.isArray(body?.messages) ? body.messages : []
      const tools = Array.isArray(body?.tools) ? body.tools : []
      const chat = url.pathname.endsWith("/chat/completions")
      const kind: Kind = chat ? classify(text, { subagent: subagentMarker }) : "other"
      const reply = chat ? pick(kind) : undefined
      options.record({
        ts: Date.now(),
        server: options.name,
        kind,
        method: req.method,
        path: url.pathname,
        host: req.headers.get("host") ?? "",
        headers: headers(req),
        model: typeof body?.model === "string" ? body.model : undefined,
        stream: body?.stream === true,
        messages: messages.length,
        tools: tools.length,
        markers: options.markers.filter((m) => text.includes(m)),
        bytes: text.length,
        reply: reply?.type ?? "none",
      })
      if (!chat) return Response.json({ object: "list", data: [] })
      if (!reply) return new Response("no scripted reply", { status: 500 })
      if (reply.type === "redirect") return new Response(null, { status: 307, headers: { location: reply.location } })
      if (reply.type === "error")
        return new Response(reply.body ?? JSON.stringify({ error: { message: "scripted error" } }), {
          status: reply.status,
          headers: { "content-type": "application/json" },
        })
      if (reply.type === "abort") {
        // Stream a partial reply, then drop the connection and stop the server so
        // retries see a dead endpoint. The harness restarts nothing.
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(`data: ${JSON.stringify(chunk({ role: "assistant", content: reply.text ?? "partial" }))}\n\n`)
            setTimeout(() => {
              controller.error(new Error("scripted abort"))
              server.stop(true)
            }, 50)
          },
        })
        return new Response(stream, { headers: { "content-type": "text/event-stream" } })
      }
      if (body?.stream !== true) return Response.json(completion(reply))
      return new Response(sse(streamChunks(reply)), {
        headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
      })
    },
  })

  return {
    port: server.port ?? 0,
    url: `${options.tls ? "https" : "http"}://${options.hostname ?? "127.0.0.1"}:${server.port}`,
    stop: () => server.stop(true),
  }
}

if (import.meta.main) {
  const args = Bun.argv.slice(2)
  const flag = (name: string) => {
    const index = args.indexOf(`--${name}`)
    return index === -1 ? undefined : args[index + 1]
  }
  const out = flag("record")
  const started = start({
    name: "standalone",
    port: Number(flag("port") ?? 0),
    markers: (flag("markers") ?? "").split(",").filter(Boolean),
    script: { primary: [{ type: "text", text: "Hello from the fake inference server." }] },
    record: (entry) => {
      const line = JSON.stringify(entry)
      if (out) appendFileSync(out, line + "\n")
      console.log(line)
    },
  })
  console.log(`fake inference listening on ${started.url}`)
}
