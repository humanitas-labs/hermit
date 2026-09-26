import { Layer, Schema } from "effect"
import { FetchHttpClient } from "effect/unstable/http"

// Hermit inference boundary. Classifies the destination of every model call
// and refuses the ones the active preset does not permit. See
// `docs/privacy-model.md` section 15 and `.plan/10-inference-boundary.md`.
//
// Two seams call into this module: the AI SDK fetch wrapper in
// `packages/opencode/src/provider/provider.ts` (V1) and the `RequestExecutor`
// HTTP client in `effect/app-node-platform.ts` (native runtime and V2). Both
// use `guardFetch`, so the redirect rules below apply to every path.

export const Class = Schema.Literals(["local", "user", "third-party"])
export type Class = typeof Class.Type

export const Preset = Schema.Literals(["private", "trusted", "external"])
export type Preset = typeof Preset.Type

export type Policy = {
  readonly preset: Preset
  // Origins the user designated as their own endpoints via `provider.<id>.owner: "user"`.
  readonly user: ReadonlySet<string>
}

export const DEFAULT: Policy = { preset: "private", user: new Set() }

export class DestinationError extends Schema.TaggedErrorClass<DestinationError>()("HermitDestinationError", {
  origin: Schema.String,
  class: Class,
  preset: Preset,
  message: Schema.String,
}) {}

const RANK: Record<Preset, number> = { private: 0, trusted: 1, external: 2 }
const PERMITTED: Record<Preset, ReadonlyArray<Class>> = {
  private: ["local"],
  trusted: ["local", "user"],
  external: ["local", "user", "third-party"],
}
const REDIRECT = new Set([301, 302, 303, 307, 308])
const MAX_REDIRECTS = 5

// Literal loopback only. No DNS, no suffix matching, no private ranges.
export function loopback(hostname: string) {
  if (hostname === "localhost" || hostname === "[::1]") return true
  if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true
  return /^\[::ffff:(127\.\d{1,3}\.\d{1,3}\.\d{1,3}|7f[0-9a-f]{2}:[0-9a-f]{1,4})\]$/.test(hostname)
}

export function classify(url: URL, policy: Policy): Class {
  if (loopback(url.hostname)) return "local"
  if (policy.user.has(url.origin)) return "user"
  return "third-party"
}

export function permits(preset: Preset, cls: Class) {
  return PERMITTED[preset].includes(cls)
}

export function stricter(a: Preset, b: Preset): Preset {
  return RANK[a] <= RANK[b] ? a : b
}

export function check(url: URL, policy: Policy) {
  const cls = classify(url, policy)
  if (permits(policy.preset, cls)) return
  return new DestinationError({
    origin: url.origin,
    class: cls,
    preset: policy.preset,
    message: `Inference destination ${url.origin} is ${label(cls)} and the ${policy.preset} preset does not permit it. Set hermit.preset in your user config or choose a permitted model.`,
  })
}

// Local and user endpoints never redirect. Third-party endpoints may redirect
// within the same host and class only.
export function redirect(from: URL, to: URL, policy: Policy) {
  const source = classify(from, policy)
  const target = classify(to, policy)
  if (source !== "third-party")
    return new DestinationError({
      origin: to.origin,
      class: target,
      preset: policy.preset,
      message: `${label(source)} inference endpoint ${from.origin} redirected to ${to.origin}. Redirects from ${label(source)} endpoints are refused.`,
    })
  if (target === "third-party" && to.hostname === from.hostname) return check(to, policy)
  return new DestinationError({
    origin: to.origin,
    class: target,
    preset: policy.preset,
    message: `Inference endpoint ${from.origin} redirected to ${to.origin}, which is a different host. Cross-host redirects are refused.`,
  })
}

export function label(cls: Class) {
  return cls === "third-party" ? "third party" : cls
}

export function origins(urls: Iterable<string | undefined>) {
  return new Set(
    Array.from(urls)
      .filter((url): url is string => typeof url === "string" && url !== "" && !url.includes("${"))
      .filter((url) => URL.canParse(url))
      .map((url) => new URL(url).origin),
  )
}

// Derives the policy from a merged config whose project-level policy keys were
// already stripped. A provider marked `owner: "user"` needs an explicit
// `options.baseURL` (or `api`); the origin of that URL becomes a user endpoint.
export function fromConfig(config: {
  hermit?: { preset?: Preset }
  provider?: Record<string, { owner?: "user"; api?: string; options?: { baseURL?: string } }>
}): Policy {
  return {
    preset: config.hermit?.preset ?? "private",
    user: origins(
      Object.values(config.provider ?? {})
        .filter((item) => item.owner === "user")
        .flatMap((item) => [item.options?.baseURL, item.api]),
    ),
  }
}

// Wraps a fetch so every request, and every redirect hop, is checked against
// the policy before any bytes leave the process. Redirects are followed
// manually so the target is checked before the body is re-sent.
export function guardFetch(input: { fetch: typeof globalThis.fetch; policy: () => Policy }): typeof globalThis.fetch {
  const guarded = async (request: string | URL | Request, init?: RequestInit) => {
    const first = toURL(request)
    const manual = init?.redirect === "manual" || (request instanceof Request && request.redirect === "manual")
    let url = first
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const policy = input.policy()
      const refused = check(url, policy)
      if (refused) throw refused
      const response =
        request instanceof Request
          ? await input.fetch(hop === 0 ? request : new Request(url.toString(), request), {
              ...init,
              redirect: "manual",
            })
          : await input.fetch(hop === 0 ? request : url.toString(), { ...init, redirect: "manual" })
      if (!REDIRECT.has(response.status) || manual) return response
      const location = response.headers.get("location")
      if (!location) return response
      const next = new URL(location, url)
      const blocked = redirect(url, next, policy)
      if (blocked) throw blocked
      url = next
    }
    throw new DestinationError({
      origin: url.origin,
      class: classify(url, input.policy()),
      preset: input.policy().preset,
      message: `Inference endpoint ${first.origin} redirected more than ${MAX_REDIRECTS} times.`,
    })
  }
  return Object.assign(guarded, { preconnect: input.fetch.preconnect })
}

function toURL(input: string | URL | Request) {
  if (input instanceof URL) return input
  if (typeof input === "string") return new URL(input)
  return new URL(input.url)
}

// Process-global policy for seams that have no instance config in scope
// (the native runtime and the V2 runner share one global `RequestExecutor`).
// It only narrows: the strictest preset seen wins and user origins accumulate.
// Widening requires a restart, which keeps the global seam fail-closed when
// several instances with different presets share a process.
let active: Policy = DEFAULT
let seen = false

export function current() {
  return active
}

export function narrow(policy: Policy) {
  active = {
    preset: seen ? stricter(active.preset, policy.preset) : policy.preset,
    user: new Set([...active.user, ...policy.user]),
  }
  seen = true
  return active
}

// The one legitimate widening: the user changed their own user-level config through the app.
// The global policy is replaced by that config's policy and instances narrow it again on reload.
export function replace(policy: Policy) {
  active = policy
  seen = false
}

// Test hook.
export function reset(policy: Policy = DEFAULT) {
  active = policy
  seen = false
}

export const fetchLayer = Layer.succeed(
  FetchHttpClient.Fetch,
  guardFetch({ fetch: globalThis.fetch, policy: () => active }),
)

export * as HermitPolicy from "./policy"
