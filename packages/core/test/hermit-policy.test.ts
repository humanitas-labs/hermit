import { afterAll, describe, expect, test } from "bun:test"
import { HermitPolicy } from "@opencode-ai/core/hermit/policy"

const external: HermitPolicy.Policy = { preset: "external", user: new Set() }
const trusted: HermitPolicy.Policy = { preset: "trusted", user: new Set(["https://llm.example.com"]) }

describe("classify", () => {
  test("literal loopback is local, nothing else is", () => {
    for (const host of ["http://127.0.0.1:11434", "http://localhost:8080", "http://[::1]:1", "http://127.9.9.9"])
      expect(HermitPolicy.classify(new URL(host), HermitPolicy.DEFAULT)).toBe("local")
    for (const host of ["http://0.0.0.0:11434", "http://10.0.0.5", "http://192.168.1.2:8080", "https://api.openai.com"])
      expect(HermitPolicy.classify(new URL(host), HermitPolicy.DEFAULT)).toBe("third-party")
  })

  test("userinfo and case tricks do not produce local", () => {
    expect(HermitPolicy.classify(new URL("http://localhost@evil.example/"), HermitPolicy.DEFAULT)).toBe("third-party")
    expect(HermitPolicy.classify(new URL("http://LOCALHOST:1/"), HermitPolicy.DEFAULT)).toBe("local")
    expect(HermitPolicy.classify(new URL("http://127.0.0.1.example/"), HermitPolicy.DEFAULT)).toBe("third-party")
  })

  test("user origins come only from the policy and never become local", () => {
    expect(HermitPolicy.classify(new URL("https://llm.example.com/v1"), trusted)).toBe("user")
    expect(HermitPolicy.classify(new URL("https://llm.example.com:8443/v1"), trusted)).toBe("third-party")
    expect(HermitPolicy.classify(new URL("http://llm.example.com/v1"), trusted)).toBe("third-party")
  })
})

describe("check", () => {
  test("presets permit exactly their classes", () => {
    const local = new URL("http://127.0.0.1:1")
    const user = new URL("https://llm.example.com")
    const third = new URL("https://api.openai.com")
    expect(HermitPolicy.check(local, HermitPolicy.DEFAULT)).toBeUndefined()
    expect(HermitPolicy.check(user, { ...trusted, preset: "private" })?.class).toBe("user")
    expect(HermitPolicy.check(user, trusted)).toBeUndefined()
    expect(HermitPolicy.check(third, trusted)?.class).toBe("third-party")
    expect(HermitPolicy.check(third, external)).toBeUndefined()
  })

  test("errors carry only the origin", () => {
    const error = HermitPolicy.check(new URL("https://api.openai.com/v1/chat?key=secret"), HermitPolicy.DEFAULT)
    expect(error?.origin).toBe("https://api.openai.com")
    expect(error?.message).not.toContain("secret")
  })
})

describe("redirect", () => {
  test("local and user endpoints never redirect", () => {
    const local = new URL("http://127.0.0.1:1/v1")
    expect(HermitPolicy.redirect(local, new URL("http://127.0.0.1:1/v2"), external)).toBeDefined()
    expect(
      HermitPolicy.redirect(new URL("https://llm.example.com"), new URL("https://llm.example.com/x"), trusted),
    ).toBeDefined()
  })

  test("third party may redirect within the same host only", () => {
    const from = new URL("https://api.openai.com/v1")
    expect(HermitPolicy.redirect(from, new URL("https://api.openai.com/v2"), external)).toBeUndefined()
    expect(HermitPolicy.redirect(from, new URL("https://cdn.openai.com/v2"), external)).toBeDefined()
    expect(HermitPolicy.redirect(from, new URL("http://127.0.0.1:1/v2"), external)).toBeDefined()
  })
})

describe("fromConfig", () => {
  test("defaults to private and derives user origins from owner providers with a baseURL", () => {
    expect(HermitPolicy.fromConfig({})).toEqual(HermitPolicy.DEFAULT)
    const policy = HermitPolicy.fromConfig({
      hermit: { preset: "trusted" },
      provider: {
        mine: { owner: "user", options: { baseURL: "https://llm.example.com/v1" } },
        unset: { owner: "user" },
        templated: { owner: "user", options: { baseURL: "https://${HOST}/v1" } },
        other: { options: { baseURL: "https://api.other.com" } },
      },
    })
    expect(policy.preset).toBe("trusted")
    expect(Array.from(policy.user)).toEqual(["https://llm.example.com"])
  })
})

describe("narrow", () => {
  afterAll(() => HermitPolicy.reset())

  test("the global policy only gets stricter and accumulates user origins", () => {
    HermitPolicy.reset()
    expect(HermitPolicy.narrow(external).preset).toBe("external")
    expect(HermitPolicy.narrow(trusted).preset).toBe("trusted")
    expect(HermitPolicy.narrow(external).preset).toBe("trusted")
    expect(Array.from(HermitPolicy.current().user)).toEqual(["https://llm.example.com"])
  })
})

describe("guardFetch", () => {
  const hits: string[] = []
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const url = new URL(request.url)
      hits.push(url.pathname)
      if (url.pathname === "/redirect") return Response.redirect(`${url.origin}/target`, 307)
      return new Response("ok")
    },
  })
  afterAll(() => server.stop(true))

  test("permitted requests pass through unchanged", async () => {
    const guarded = HermitPolicy.guardFetch({ fetch, policy: () => HermitPolicy.DEFAULT })
    const response = await guarded(`${server.url.origin}/plain`, { method: "POST", body: "x" })
    expect(await response.text()).toBe("ok")
    expect(hits).toEqual(["/plain"])
  })

  test("refused requests never reach the network", async () => {
    hits.length = 0
    const guarded = HermitPolicy.guardFetch({ fetch, policy: () => HermitPolicy.DEFAULT })
    const error = await guarded(`http://0.0.0.0:${server.port}/plain`).catch((e) => e)
    expect(error).toBeInstanceOf(HermitPolicy.DestinationError)
    expect(error.class).toBe("third-party")
    expect(hits).toEqual([])
  })

  test("a redirect from a local endpoint is refused before the target is contacted", async () => {
    hits.length = 0
    const guarded = HermitPolicy.guardFetch({ fetch, policy: () => HermitPolicy.DEFAULT })
    const error = await guarded(`${server.url.origin}/redirect`, { method: "POST", body: "context" }).catch((e) => e)
    expect(error).toBeInstanceOf(HermitPolicy.DestinationError)
    expect(hits).toEqual(["/redirect"])
  })

  test("the policy is read per request, so narrowing takes effect immediately", async () => {
    hits.length = 0
    let policy: HermitPolicy.Policy = external
    const guarded = HermitPolicy.guardFetch({ fetch, policy: () => policy })
    await guarded(`http://0.0.0.0:${server.port}/first`)
    policy = HermitPolicy.DEFAULT
    await expect(guarded(`http://0.0.0.0:${server.port}/second`)).rejects.toBeInstanceOf(HermitPolicy.DestinationError)
    expect(hits).toEqual(["/first"])
  })
})
