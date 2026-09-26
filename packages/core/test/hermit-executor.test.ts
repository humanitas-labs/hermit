import { afterAll, afterEach, expect } from "bun:test"
import { Effect } from "effect"
import { HttpClientRequest } from "effect/unstable/http"
import { RequestExecutor } from "@opencode-ai/llm/route"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { requestExecutor } from "@opencode-ai/core/effect/app-node-platform"
import { HermitPolicy } from "@opencode-ai/core/hermit/policy"
import { testEffect } from "./lib/effect"

// The native runtime and the V2 runner send through this executor. Its fetch
// is guarded by the process-global policy, which defaults to private.

const it = testEffect(LayerNode.compile(requestExecutor))

const hits: string[] = []
const server = Bun.serve({
  hostname: "0.0.0.0",
  port: 0,
  fetch(request) {
    hits.push(new URL(request.url).pathname)
    return new Response("ok")
  },
})
afterAll(() => server.stop(true))
afterEach(() => {
  hits.length = 0
  HermitPolicy.reset()
})

it.live("permits loopback under the default private policy", () =>
  Effect.gen(function* () {
    const executor = yield* RequestExecutor.Service
    const response = yield* executor.execute(HttpClientRequest.post(`http://127.0.0.1:${server.port}/native`))
    expect(response.status).toBe(200)
    expect(hits).toEqual(["/native"])
  }),
)

it.live("refuses a non-loopback endpoint before contacting it", () =>
  Effect.gen(function* () {
    const executor = yield* RequestExecutor.Service
    const error = yield* executor
      .execute(HttpClientRequest.post(`http://0.0.0.0:${server.port}/native`))
      .pipe(Effect.flip)
    expect(String(error)).toContain("preset does not permit")
    expect(hits).toEqual([])
  }),
)

it.live("follows the narrowed process policy", () =>
  Effect.gen(function* () {
    HermitPolicy.narrow({ preset: "external", user: new Set() })
    const executor = yield* RequestExecutor.Service
    const response = yield* executor.execute(HttpClientRequest.post(`http://0.0.0.0:${server.port}/native`))
    expect(response.status).toBe(200)
    HermitPolicy.narrow({ preset: "private", user: new Set() })
    const error = yield* executor
      .execute(HttpClientRequest.post(`http://0.0.0.0:${server.port}/again`))
      .pipe(Effect.flip)
    expect(String(error)).toContain("preset does not permit")
    expect(hits).toEqual(["/native"])
  }),
)
