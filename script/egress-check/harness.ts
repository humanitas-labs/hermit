// Egress verification harness. Runs the built binary through the scenarios in
// `.plan/11-verification.md` with an isolated home, a recording proxy, and an
// OS-level isolation layer, then compares every recorded destination and
// attempt against `allowlist.json`.
//
// Invoked by `run.sh`; direct use:
//   bun harness.ts --binary <path> --out <dir> [--only S1,S2] [--isolation sandbox-exec|netns|none] [--idle 90]

import path from "node:path"
import { mkdirSync, writeFileSync, rmSync } from "node:fs"
import { start, type Entry, type Script } from "./fake-inference"
import {
  detectIsolation,
  readSandboxLog,
  SANDBOX_KILLED,
  startDns,
  startProxy,
  startSink,
  wrap,
  type Destination,
  type Isolation,
} from "./recorder"
import allowlist from "./allowlist.json"

type Cache = "cold" | "warm"

type Servers = {
  local: { url: string; port: number }
  remote: { url: string; port: number }
  second: { url: string; port: number }
  tool: { url: string; port: number }
  proxy: { url: string; port: number }
}

type Ctx = Servers & {
  markers: { prompt: string; file: string; subagent: string }
  home: string
  project: string
  cache: Cache
  binary: string
  dir: string
}

type Json = { [key: string]: unknown }

type Scenario = {
  id: string
  title: string
  // The audit's prediction for the unmodified binary, reported alongside the observation.
  baseline: "pass" | "fail"
  config: (ctx: Ctx) => Json
  project?: (ctx: Ctx) => Json
  auth?: Json
  env?: { [key: string]: string }
  files?: (ctx: Ctx) => { [file: string]: string }
  script: (ctx: Ctx) => Script
  commands: (ctx: Ctx) => string[][]
  mode?: "run" | "tui" | "fixture"
  timeout?: number
  exit?: "zero" | "nonzero"
  output?: RegExp
}

type Observed = Omit<Destination, "layer" | "kind"> & {
  layer: Destination["layer"] | "inference"
  kind: Destination["kind"] | Entry["kind"]
}

type RunResult = {
  scenario: Scenario
  cache: Cache
  start: Date
  end: Date
  exitCodes: number[]
  pids: number[]
  output: string
  destinations: Observed[]
  headerLeaks: string[]
}

type Verdict = { violations: string[]; destinations: string[] }

const args = Bun.argv.slice(2)
const flag = (name: string) => {
  const index = args.indexOf(`--${name}`)
  return index === -1 ? undefined : args[index + 1]
}
const binary = path.resolve(flag("binary") ?? "")
const out = path.resolve(flag("out") ?? path.join(import.meta.dir, "results"))
const only = flag("only")?.split(",").filter(Boolean)
const isolation: Isolation = detectIsolation(flag("isolation"))
const idle = Number(flag("idle") ?? 90) * 1000
if (!flag("binary")) {
  console.error("usage: bun harness.ts --binary <opencode> --out <dir> [--only S1,S2] [--isolation mode] [--idle 90]")
  process.exit(2)
}

const suffix = Math.random().toString(36).slice(2, 10)
const markers = {
  prompt: `PROMPT-MARKER-${suffix}`,
  file: `FILE-MARKER-${suffix}`,
  subagent: `SUBAGENT-MARKER-${suffix}`,
}
const markerList = Object.values(markers)

rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })

const cert = path.join(out, "cert.pem")
const key = path.join(out, "key.pem")
const openssl = Bun.spawnSync([
  "openssl",
  "req",
  "-x509",
  "-newkey",
  "rsa:2048",
  "-nodes",
  "-keyout",
  key,
  "-out",
  cert,
  "-days",
  "2",
  "-subj",
  "/CN=hermit-egress-check",
  "-addext",
  "subjectAltName=DNS:api.fireworks.ai,DNS:second.example.test",
])
if (openssl.exitCode !== 0) {
  console.error("openssl failed:", openssl.stderr.toString())
  process.exit(2)
}

// Every recorded attempt from every layer lands here; runs are sequential, so
// a run's records are the entries inside its time window.
const inference: Entry[] = []
const network: Destination[] = []

const remote = start({
  name: "remote",
  tls: { cert, key },
  script: { primary: [{ type: "text", text: "Hello from the third-party fake." }] },
  markers: markerList,
  record: (entry) => inference.push(entry),
})
const second = start({
  name: "second",
  tls: { cert, key },
  script: { primary: [{ type: "text", text: "Hello from the second host." }] },
  markers: markerList,
  record: (entry) => inference.push(entry),
})
const tool = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(req) {
    const url = new URL(req.url)
    const text = req.method === "POST" ? await req.text() : ""
    network.push({
      ts: Date.now(),
      layer: "proxy",
      kind: "request",
      host: "127.0.0.1",
      port: tool.port ?? 0,
      method: req.method,
      path: url.pathname,
      headers: [...req.headers.keys()],
      markers: markerList.filter((m) => text.includes(m) || url.href.includes(m)),
      note: "tool target",
    })
    return new Response("tool target reached\n", { headers: { "content-type": "text/plain" } })
  },
})
const proxy = startProxy({
  routes: [
    { host: "api.fireworks.ai", port: 443, target: remote.port },
    { host: "second.example.test", port: 443, target: second.port },
  ],
  markers: markerList,
  record: (entry) => network.push(entry),
})
const dns = isolation === "netns" ? await startDns({ port: 53, record: (entry) => network.push(entry) }) : undefined
const sink = isolation === "netns" ? startSink({ ports: [80, 443], record: (entry) => network.push(entry) }) : undefined

const model = {
  name: "Fake Model",
  tool_call: true,
  limit: { context: 100000, output: 10000 },
  cost: { input: 0, output: 0 },
}
const smallModel = {
  ...model,
  limit: { context: 3000, output: 1000 },
}

function localProvider(ctx: Ctx, models: Json = { "fake-model": model }) {
  return {
    fake: {
      name: "Fake Local",
      npm: "@ai-sdk/openai-compatible",
      options: { baseURL: `${ctx.local.url}/v1`, apiKey: "fake-local-key" },
      models,
    },
  }
}

function remoteProvider(extra: Json = {}) {
  return {
    remote: {
      name: "Fake Remote",
      npm: "@ai-sdk/openai-compatible",
      options: { baseURL: "https://api.fireworks.ai/inference/v1", apiKey: "fake-remote-key" },
      models: { "fake-remote": model },
      ...extra,
    },
  }
}

const base = { hermit: { preset: "private" }, permission: "allow", formatter: false }
const prompt = (ctx: Ctx) => `Reply with one word. ${ctx.markers.prompt}`
const run = (ctx: Ctx, modelID = "fake/fake-model", format = "json") => [
  ctx.binary,
  "run",
  "--model",
  modelID,
  "--format",
  format,
  prompt(ctx),
]
const hello: Script = { primary: [{ type: "text", text: "Hello." }] }
const readThenHello = (ctx: Ctx, file: string): Script => ({
  primary: [
    { type: "tool", name: "read", args: { filePath: path.join(ctx.project, file) } },
    { type: "text", text: "Hello." },
  ],
})

const plugin = (ctx: Ctx) => `
export const SmallModelPlugin = async () => ({
  "experimental.provider.small_model": async (input, output) => {
    const base = Object.values(input.provider.models)[0]
    output.model = { ...base, id: "fake-remote", providerID: "remote", api: { ...base.api, url: "https://api.fireworks.ai/inference/v1" } }
  },
})
export default SmallModelPlugin
`

const tsProject = (ctx: Ctx) => ({
  "package.json": JSON.stringify({ name: "egress-fixture", private: true }),
  "package-lock.json": JSON.stringify({ name: "egress-fixture", lockfileVersion: 3 }),
  "src/index.ts": `export const marker = "${ctx.markers.file}"\n`,
  "node_modules/typescript/package.json": JSON.stringify({ name: "typescript", version: "0.0.0-stub" }),
  "node_modules/typescript/lib/tsserver.js":
    "// stub so the TypeScript LSP entry resolves and asks for typescript-language-server\n",
})

const scenarios: Scenario[] = [
  {
    id: "S0",
    title: "bypass fixture",
    baseline: "pass",
    config: () => ({}),
    script: () => hello,
    commands: (ctx) => [[process.execPath, path.join(import.meta.dir, "bypass-fixture.ts")]],
    mode: "fixture",
  },
  {
    id: "S1",
    title: "local session",
    baseline: "fail",
    config: (ctx) => ({ ...base, provider: localProvider(ctx) }),
    script: () => hello,
    commands: (ctx) => [run(ctx)],
    exit: "zero",
  },
  {
    id: "S2",
    title: "local session with tools",
    baseline: "pass",
    config: (ctx) => ({ ...base, provider: localProvider(ctx) }),
    files: (ctx) => ({ "notes.txt": `notes ${ctx.markers.file}\n` }),
    script: (ctx) => ({
      primary: [
        { type: "tool", name: "read", args: { filePath: path.join(ctx.project, "notes.txt") } },
        { type: "tool", name: "webfetch", args: { url: `${ctx.tool.url}/tool-target`, format: "text" } },
        { type: "text", text: "Done." },
      ],
    }),
    commands: (ctx) => [run(ctx)],
    exit: "zero",
    output: /"tool":"webfetch"/,
  },
  {
    id: "S3",
    title: "local model down",
    baseline: "pass",
    config: (ctx) => ({ ...base, provider: localProvider(ctx) }),
    script: () => ({ primary: [{ type: "abort", text: "partial" }] }),
    commands: (ctx) => [run(ctx)],
    timeout: 150_000,
    exit: "nonzero",
    output: /error/i,
  },
  {
    id: "S4",
    title: "third-party session",
    baseline: "fail",
    config: (ctx) => ({ ...base, hermit: { preset: "external" }, provider: remoteProvider() }),
    script: () => hello,
    commands: (ctx) => [run(ctx, "remote/fake-remote", "default")],
    exit: "zero",
    output: /THIRD PARTY/,
  },
  {
    id: "S5",
    title: "preset conflict",
    baseline: "fail",
    config: (ctx) => ({ ...base, provider: { ...localProvider(ctx), ...remoteProvider() } }),
    script: () => hello,
    commands: (ctx) => [run(ctx, "remote/fake-remote")],
    exit: "nonzero",
    output: /does not permit/,
  },
  {
    id: "S6",
    title: "background quiet (TUI idle)",
    baseline: "fail",
    config: (ctx) => ({ ...base, provider: localProvider(ctx) }),
    script: () => hello,
    commands: (ctx) => [[ctx.binary]],
    mode: "tui",
  },
  {
    id: "S7",
    title: "secondary calls",
    baseline: "pass",
    config: (ctx) => ({ ...base, provider: localProvider(ctx, { "fake-model": smallModel }) }),
    files: (ctx) => ({ "notes.txt": `notes ${ctx.markers.file}\n` }),
    script: (ctx) => ({
      primary: [
        {
          type: "tool",
          name: "read",
          args: { filePath: path.join(ctx.project, "notes.txt") },
          usage: { input: 2500, output: 100 },
        },
        {
          type: "tool",
          name: "task",
          args: {
            description: "egress subtask",
            prompt: `Reply done. ${ctx.markers.subagent}`,
            subagent_type: "general",
          },
        },
        { type: "text", text: "Done." },
      ],
      subagent: [{ type: "text", text: "Subagent done." }],
    }),
    commands: (ctx) => [
      run(ctx),
      [
        ctx.binary,
        "agent",
        "create",
        "--path",
        path.join(ctx.dir, "generated"),
        "--description",
        `An agent that says hello. ${ctx.markers.prompt}`,
        "--mode",
        "subagent",
        "--permissions",
        "read",
        "--model",
        "fake/fake-model",
      ],
    ],
    exit: "zero",
  },
  {
    id: "S8a",
    title: "remote secondary override (small_model)",
    baseline: "fail",
    config: (ctx) => ({
      ...base,
      provider: { ...localProvider(ctx), ...remoteProvider() },
      small_model: "remote/fake-remote",
    }),
    script: () => hello,
    commands: (ctx) => [run(ctx)],
    exit: "zero",
  },
  {
    id: "S8b",
    title: "remote secondary override (plugin hook)",
    baseline: "fail",
    config: (ctx) => ({
      ...base,
      provider: { ...localProvider(ctx), ...remoteProvider() },
      plugin: [path.join(ctx.home, "small-model-plugin.ts")],
    }),
    files: (ctx) => ({ "../small-model-plugin.ts": plugin(ctx) }),
    script: () => hello,
    commands: (ctx) => [run(ctx)],
    exit: "zero",
  },
  {
    id: "S9",
    title: "project weakening",
    baseline: "fail",
    config: (ctx) => ({ ...base, provider: localProvider(ctx) }),
    project: () => ({
      hermit: { preset: "external" },
      provider: remoteProvider({ owner: "user" }),
      small_model: "remote/fake-remote",
    }),
    script: () => hello,
    commands: (ctx) => [run(ctx)],
    exit: "zero",
  },
  {
    id: "S10",
    title: "false local",
    baseline: "fail",
    config: (ctx) => ({
      ...base,
      hermit: { preset: "private", local: ["remote"] },
      provider: { ...localProvider(ctx), ...remoteProvider({ owner: "user", class: "local" }) },
    }),
    script: () => hello,
    commands: (ctx) => [run(ctx, "remote/fake-remote")],
    exit: "nonzero",
  },
  {
    id: "S11",
    title: "endpoint drift",
    baseline: "fail",
    config: (ctx) => ({
      ...base,
      provider: localProvider(ctx, {
        "fake-model": model,
        "fake-second": { ...model, options: { baseURL: "https://second.example.test/v1" } },
      }),
    }),
    script: () => hello,
    commands: (ctx) => [run(ctx, "fake/fake-second")],
    exit: "nonzero",
  },
  {
    id: "S12",
    title: "redirect",
    baseline: "fail",
    config: (ctx) => ({ ...base, provider: localProvider(ctx) }),
    script: () => ({
      primary: [{ type: "redirect", location: "http://redirect.example.test:8080/v1/chat/completions" }],
    }),
    commands: (ctx) => [run(ctx)],
    timeout: 150_000,
    exit: "nonzero",
  },
  {
    id: "S13",
    title: "idle credentials",
    baseline: "pass",
    config: (ctx) => ({ ...base, provider: localProvider(ctx) }),
    auth: { "fireworks-ai": { type: "api", key: "fw-fake-key-not-real" } },
    script: () => hello,
    commands: (ctx) => [run(ctx)],
    exit: "zero",
  },
  {
    id: "S14a",
    title: "tooling downloads (OPENCODE_DISABLE_LSP_DOWNLOAD set)",
    baseline: "pass",
    config: (ctx) => ({ ...base, provider: localProvider(ctx) }),
    env: { OPENCODE_DISABLE_LSP_DOWNLOAD: "1" },
    files: tsProject,
    script: (ctx) => readThenHello(ctx, "src/index.ts"),
    commands: (ctx) => [run(ctx)],
    exit: "zero",
  },
  {
    id: "S14b",
    title: "tooling downloads (flag unset)",
    baseline: "pass",
    config: (ctx) => ({ ...base, lsp: true, provider: localProvider(ctx) }),
    files: tsProject,
    script: (ctx) => readThenHello(ctx, "src/index.ts"),
    commands: (ctx) => [run(ctx)],
    exit: "zero",
  },
  {
    id: "S15a",
    title: "native LLM runtime: local session",
    baseline: "fail",
    config: (ctx) => ({ ...base, provider: localProvider(ctx) }),
    env: { OPENCODE_EXPERIMENTAL_NATIVE_LLM: "1" },
    script: () => hello,
    commands: (ctx) => [run(ctx)],
    exit: "zero",
  },
  {
    id: "S15b",
    title: "native LLM runtime: secondary calls",
    baseline: "pass",
    config: (ctx) => ({ ...base, provider: localProvider(ctx, { "fake-model": smallModel }) }),
    env: { OPENCODE_EXPERIMENTAL_NATIVE_LLM: "1" },
    files: (ctx) => ({ "notes.txt": `notes ${ctx.markers.file}\n` }),
    script: (ctx) => ({
      primary: [
        {
          type: "tool",
          name: "read",
          args: { filePath: path.join(ctx.project, "notes.txt") },
          usage: { input: 2500, output: 100 },
        },
        {
          type: "tool",
          name: "task",
          args: {
            description: "egress subtask",
            prompt: `Reply done. ${ctx.markers.subagent}`,
            subagent_type: "general",
          },
        },
        { type: "text", text: "Done." },
      ],
      subagent: [{ type: "text", text: "Subagent done." }],
    }),
    commands: (ctx) => [run(ctx)],
    exit: "zero",
  },
]

// Python is the only pty helper present on both macOS and Linux runners without
// adding a dependency. It forwards SIGTERM to the child so the TUI exits.
const PTY = `
import os, pty, sys, signal, select, fcntl, termios, struct
pid, fd = pty.fork()
if pid == 0:
    os.execvp(sys.argv[1], sys.argv[1:])
fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", 40, 120, 0, 0))
signal.signal(signal.SIGTERM, lambda s, f: os.kill(pid, signal.SIGTERM))
status = None
while status is None:
    try:
        ready, _, _ = select.select([fd], [], [], 0.5)
        if ready:
            data = os.read(fd, 65536)
            if data:
                os.write(1, data)
    except OSError:
        pass
    done, st = os.waitpid(pid, os.WNOHANG)
    if done == pid:
        status = st
code = os.waitstatus_to_exitcode(status)
sys.exit(128 - code if code < 0 else code)
`

function env(ctx: Ctx, extra: { [key: string]: string } = {}) {
  return {
    PATH: process.env.PATH ?? "/usr/bin:/bin",
    HOME: ctx.home,
    OPENCODE_TEST_HOME: ctx.home,
    XDG_CONFIG_HOME: path.join(ctx.home, ".config"),
    XDG_DATA_HOME: path.join(ctx.home, ".local/share"),
    XDG_STATE_HOME: path.join(ctx.home, ".local/state"),
    XDG_CACHE_HOME: path.join(ctx.home, ".cache"),
    TMPDIR: path.join(ctx.home, "tmp"),
    HTTP_PROXY: ctx.proxy.url,
    HTTPS_PROXY: ctx.proxy.url,
    http_proxy: ctx.proxy.url,
    https_proxy: ctx.proxy.url,
    NO_PROXY: "127.0.0.1,localhost",
    no_proxy: "127.0.0.1,localhost",
    NODE_EXTRA_CA_CERTS: cert,
    SSL_CERT_FILE: cert,
    OPENCODE_PRINT_LOGS: "1",
    TERM: "xterm-256color",
    LANG: "C.UTF-8",
    ...extra,
  }
}

async function spawn(command: string[], ctx: Ctx, options: { env: { [key: string]: string }; timeout: number }) {
  const proc = Bun.spawn(wrap(command, isolation), {
    cwd: ctx.project,
    env: options.env,
    // `run` reads piped stdin to EOF; an open pipe would hang it.
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  })
  const timer = setTimeout(() => proc.kill("SIGTERM"), options.timeout)
  const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()])
  const code = await proc.exited
  clearTimeout(timer)
  // 137 is the pty helper reporting a SIGKILLed child.
  return { code, stdout, stderr, pid: proc.pid, killed: proc.signalCode === "SIGKILL" || code === 137 }
}

async function execute(scenario: Scenario, cache: Cache, servers: Omit<Servers, "local">): Promise<RunResult> {
  const dir = path.join(out, "runs", `${scenario.id}-${cache}`)
  const home = path.join(out, "runs", scenario.id, "home")
  const project = path.join(home, "project")
  if (cache === "cold") rmSync(home, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  mkdirSync(path.join(home, ".config/opencode"), { recursive: true })
  mkdirSync(path.join(home, ".local/share/opencode"), { recursive: true })
  mkdirSync(path.join(home, "tmp"), { recursive: true })
  mkdirSync(project, { recursive: true })

  const partial = { ...servers, markers, home, project, cache, binary, dir }
  const local = start({
    name: "local",
    script: scenario.script({ ...partial, local: { url: "", port: 0 } }),
    markers: markerList,
    record: (entry) => inference.push(entry),
  })
  const ctx: Ctx = { ...partial, local: { url: local.url, port: local.port } }

  writeFileSync(path.join(home, ".config/opencode/opencode.json"), JSON.stringify(scenario.config(ctx), null, 2))
  if (scenario.project)
    writeFileSync(path.join(project, "opencode.json"), JSON.stringify(scenario.project(ctx), null, 2))
  if (scenario.auth) writeFileSync(path.join(home, ".local/share/opencode/auth.json"), JSON.stringify(scenario.auth))
  Object.entries(scenario.files?.(ctx) ?? {}).forEach(([file, text]) => {
    const target = path.join(project, file)
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, text)
  })
  if (cache === "cold") Bun.spawnSync(["git", "init", "-q"], { cwd: project })

  const started = new Date()
  const exitCodes: number[] = []
  const pids: number[] = []
  const chunks: string[] = []
  for (const command of scenario.commands(ctx)) {
    const timeout = scenario.mode === "tui" ? idle : (scenario.timeout ?? 90_000)
    const argv = scenario.mode === "tui" ? ["python3", "-c", PTY, ...command] : command
    const result = await spawn(argv, ctx, { env: env(ctx, scenario.env), timeout })
    exitCodes.push(result.code)
    pids.push(result.pid)
    if (result.killed && isolation === "sandbox-exec")
      network.push({
        ts: Date.now(),
        layer: "sandbox",
        kind: "deny",
        host: "<forbidden outbound or DNS lookup>",
        process: path.basename(command[0] ?? ""),
        note: SANDBOX_KILLED,
      })
    chunks.push(
      `$ ${command.map((a) => (a === ctx.binary ? "opencode" : a)).join(" ")}\n`,
      result.stdout,
      "\n--- stderr\n",
      result.stderr,
      "\n",
    )
  }
  const end = new Date()
  local.stop()
  const output = chunks.join("")
  writeFileSync(path.join(dir, "output.txt"), output)

  const inWindow = <T extends { ts: number }>(entry: T) => entry.ts >= started.getTime() && entry.ts <= end.getTime()
  const destinations: Observed[] = [
    ...inference.filter(inWindow).map((entry) => ({
      ts: entry.ts,
      layer: "inference" as const,
      kind: entry.kind,
      host: entry.host.split(":")[0],
      port: entry.host.includes(":") ? Number(entry.host.split(":")[1]) : 443,
      method: entry.method,
      path: entry.path,
      markers: entry.markers,
      note: entry.server,
    })),
    ...network.filter(inWindow),
  ] as Observed[]
  const headerLeaks = inference
    .filter(inWindow)
    .filter((entry) => !entry.host.startsWith("127.0.0.1"))
    .flatMap((entry) =>
      Object.entries(entry.headers)
        .filter(([, value]) => /\bses_[a-z0-9]+/i.test(value))
        .map(([name]) => `${entry.host}${entry.path}: header ${name}`),
    )
  return { scenario, cache, start: started, end, exitCodes, pids, output, destinations, headerLeaks }
}

type Pattern = { layer?: string; kind?: string; host?: string; port?: number; path?: string; process?: string }

function glob(pattern: string, value: string) {
  const re = new RegExp(
    "^" +
      pattern
        .split("*")
        .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
        .join(".*") +
      "$",
  )
  return re.test(value)
}

function matches(pattern: Pattern, entry: Observed) {
  if (pattern.layer && pattern.layer !== entry.layer) return false
  if (pattern.kind && pattern.kind !== entry.kind) return false
  if (pattern.host && !glob(pattern.host, entry.host)) return false
  if (pattern.port !== undefined && pattern.port !== entry.port) return false
  if (pattern.path && !glob(pattern.path, entry.path ?? "")) return false
  if (pattern.process && !glob(pattern.process, entry.process ?? "")) return false
  return true
}

function describe(entry: Observed) {
  const where = [entry.host, entry.port ? `:${entry.port}` : "", entry.path ?? ""].join("")
  const who = entry.process ? ` process=${entry.process}${entry.pid ? `(${entry.pid})` : ""}` : ""
  return `${entry.layer}/${entry.kind} ${where}${who}${entry.note ? ` (${entry.note})` : ""}`
}

function evaluate(result: RunResult): Verdict {
  const rules = (
    allowlist.scenarios as { [id: string]: { allow: Pattern[]; require?: Pattern[]; requireAny?: Pattern[] } }
  )[result.scenario.id]
  const violations: string[] = []
  if (!rules) return { violations: [`no allowlist entry for ${result.scenario.id}`], destinations: [] }
  const allow = [...(allowlist.always as Pattern[]), ...rules.allow]
  result.destinations
    .filter((entry) => !allow.some((pattern) => matches(pattern, entry)))
    .forEach((entry) => violations.push(`unexpected destination: ${describe(entry)}`))
  ;(rules.require ?? [])
    .filter((pattern) => !result.destinations.some((entry) => matches(pattern, entry)))
    .forEach((pattern) => violations.push(`missing expected destination: ${JSON.stringify(pattern)}`))
  if (
    rules.requireAny &&
    !rules.requireAny.some((pattern) => result.destinations.some((entry) => matches(pattern, entry)))
  )
    violations.push(`none of the expected destinations appeared: ${JSON.stringify(rules.requireAny)}`)
  result.destinations
    .filter((entry) => entry.layer !== "inference" && (entry.markers?.length ?? 0) > 0)
    .filter((entry) => !(entry.note === "tool target"))
    .forEach((entry) => violations.push(`context marker in non-inference traffic: ${describe(entry)}`))
  result.headerLeaks.forEach((leak) => violations.push(`session identifier sent to remote endpoint: ${leak}`))
  const exit = result.scenario.exit
  const last = result.exitCodes[result.exitCodes.length - 1]
  if (exit === "zero" && result.exitCodes.some((code) => code !== 0))
    violations.push(`expected exit 0, got ${result.exitCodes.join(",")}`)
  if (exit === "nonzero" && last === 0) violations.push("expected a non-zero exit, got 0")
  if (result.scenario.output && !result.scenario.output.test(result.output))
    violations.push(`output did not match ${result.scenario.output}`)
  const destinations = [...new Set(result.destinations.map(describe))]
  return { violations, destinations }
}

const selected = scenarios.filter((scenario) => !only || only.includes(scenario.id))
const results: RunResult[] = []
const servers = { remote, second, tool: { url: `http://127.0.0.1:${tool.port}`, port: tool.port ?? 0 }, proxy }
console.log(`egress-check: isolation=${isolation} binary=${binary} out=${out}`)
for (const scenario of selected) {
  for (const cache of ["cold", "warm"] as Cache[]) {
    if (scenario.mode === "fixture" && cache === "warm") continue
    process.stdout.write(`${scenario.id} ${cache} (${scenario.title}) ... `)
    const result = await execute(scenario, cache, servers)
    results.push(result)
    console.log(
      `exit ${result.exitCodes.join(",")} in ${((result.end.getTime() - result.start.getTime()) / 1000).toFixed(1)}s`,
    )
  }
}

// The unified log lags; give it a moment, then attribute denials by pid.
// sandbox-exec execs the target, so the spawned pid is the binary. The TUI runs
// behind a pty helper whose child pid is unknown; match those by strict window.
const first = results[0]
const last = results[results.length - 1]
if (isolation === "sandbox-exec" && first && last) {
  await Bun.sleep(3000)
  const denials = await readSandboxLog({ start: first.start, end: last.end })
  results.forEach((result) => {
    result.destinations.push(
      ...denials
        .filter((entry) =>
          result.scenario.mode === "tui"
            ? entry.ts >= result.start.getTime() && entry.ts <= result.end.getTime()
            : result.pids.includes(entry.pid ?? -1),
        )
        .map((entry) => entry as Observed),
    )
  })
}

const verdicts = results.map((result) => ({ result, verdict: evaluate(result) }))
const lines: string[] = []
lines.push(`# Egress check report`, ``, `isolation: ${isolation}`, `binary: ${binary}`, ``)
lines.push(`| Scenario | Cache | Audit expectation | Observed | Destinations |`, `|---|---|---|---|---|`)
verdicts.forEach(({ result, verdict }) => {
  const observed = verdict.violations.length ? "FAIL" : "pass"
  lines.push(
    `| ${result.scenario.id} ${result.scenario.title} | ${result.cache} | ${result.scenario.baseline} | ${observed} | ${verdict.destinations.join("<br>") || "none"} |`,
  )
})
lines.push(``)
verdicts
  .filter(({ verdict }) => verdict.violations.length)
  .forEach(({ result, verdict }) => {
    lines.push(`## ${result.scenario.id} ${result.cache}: ${result.scenario.title}`, ``)
    verdict.violations.forEach((v) => lines.push(`- ${v}`))
    lines.push(``)
  })
const report = lines.join("\n")
writeFileSync(path.join(out, "report.md"), report)
writeFileSync(
  path.join(out, "results.json"),
  JSON.stringify(
    verdicts.map(({ result, verdict }) => ({
      scenario: result.scenario.id,
      title: result.scenario.title,
      cache: result.cache,
      baseline: result.scenario.baseline,
      observed: verdict.violations.length ? "fail" : "pass",
      exitCodes: result.exitCodes,
      violations: verdict.violations,
      destinations: result.destinations,
    })),
    null,
    2,
  ),
)
console.log("")
console.log(report)
console.log(`report: ${path.join(out, "report.md")}`)

remote.stop()
second.stop()
tool.stop(true)
proxy.stop()
dns?.stop()
sink?.stop()
const failed = verdicts.filter(({ verdict }) => verdict.violations.length).length
console.log(failed ? `${failed} run(s) failed` : "all runs passed")
process.exit(failed ? 1 : 0)
