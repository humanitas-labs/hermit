import { afterEach, expect } from "bun:test"
import { streamText } from "ai"
import { Effect } from "effect"
import path from "path"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { Global } from "@opencode-ai/core/global"
import { HermitPolicy } from "@opencode-ai/core/hermit/policy"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"
import { disposeAllInstances, provideTmpdirInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { testProviderConfig } from "../lib/test-provider"
import { Env } from "@/env"
import { Plugin } from "@/plugin"
import { Provider } from "@/provider/provider"

// Drives the real V1 seam: Provider.getLanguage -> resolveSDK fetch wrapper.
// The fake server listens on 0.0.0.0 so the same port is reachable through a
// loopback address (local class) and a non-loopback literal (third-party class).

const it = testEffect(
  LayerNode.compile(LayerNode.group([Provider.node, Env.node, Plugin.node, CrossSpawnSpawner.node])),
)

const hits: string[] = []
const server = Bun.serve({
  hostname: "0.0.0.0",
  port: 0,
  fetch(request) {
    const url = new URL(request.url)
    hits.push(url.pathname)
    if (url.pathname.startsWith("/redirect")) return Response.redirect(`${url.origin}/leak/chat/completions`, 307)
    return new Response(
      `data: ${JSON.stringify({ id: "1", object: "chat.completion.chunk", choices: [{ index: 0, delta: { content: "ok" }, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`,
      { headers: { "content-type": "text/event-stream" } },
    )
  },
})
const local = `http://127.0.0.1:${server.port}`
const remote = `http://0.0.0.0:${server.port}`
const userConfig = path.join(Global.Path.config, "opencode.json")

afterEach(async () => {
  hits.length = 0
  await Bun.file(userConfig)
    .delete()
    .catch(() => {})
  await disposeAllInstances()
})

const TEST = ProviderV2.ID.make("test")
const MODEL = ModelV2.ID.make("test-model")

const ask = Effect.fn(function* () {
  const provider = yield* Provider.Service
  const model = yield* provider.getModel(TEST, MODEL)
  const result = streamText({
    model: yield* provider.getLanguage(model),
    onError() {},
    messages: [{ role: "user", content: "hello" }],
  })
  const errors = yield* Effect.promise(async () => {
    const errors: unknown[] = []
    for await (const part of result.fullStream) if (part.type === "error") errors.push(part.error)
    return errors
  })
  return { model, errors }
})

it.live("private preset permits a loopback endpoint", () =>
  provideTmpdirInstance(
    () =>
      Effect.gen(function* () {
        const { model, errors } = yield* ask()
        expect(model.boundary).toBe("local")
        expect(model.permitted).toBe(true)
        expect(errors).toEqual([])
        expect(hits).toHaveLength(1)
      }),
    { config: testProviderConfig(local) },
  ),
)

it.live("private preset refuses a non-loopback endpoint before any request is sent", () =>
  provideTmpdirInstance(
    () =>
      Effect.gen(function* () {
        const { model, errors } = yield* ask()
        expect(model.boundary).toBe("third-party")
        expect(model.permitted).toBe(false)
        expect(errors).toHaveLength(1)
        expect(errors[0]).toBeInstanceOf(HermitPolicy.DestinationError)
        expect(hits).toEqual([])
      }),
    { config: testProviderConfig(remote) },
  ),
)

it.live("a project config cannot raise the preset", () =>
  provideTmpdirInstance(
    () =>
      Effect.gen(function* () {
        const { model, errors } = yield* ask()
        expect(model.permitted).toBe(false)
        expect(errors[0]).toBeInstanceOf(HermitPolicy.DestinationError)
        expect(hits).toEqual([])
      }),
    { config: { ...testProviderConfig(remote), hermit: { preset: "external" } } },
  ),
)

it.live("user config external preset permits a third-party endpoint", () =>
  Effect.gen(function* () {
    yield* Effect.promise(() => Bun.write(userConfig, JSON.stringify({ hermit: { preset: "external" } })))
    yield* provideTmpdirInstance(
      () =>
        Effect.gen(function* () {
          const { model, errors } = yield* ask()
          expect(model.boundary).toBe("third-party")
          expect(model.permitted).toBe(true)
          expect(errors).toEqual([])
          expect(hits).toHaveLength(1)
        }),
      { config: testProviderConfig(remote) },
    )
  }),
)

it.live("trusted preset permits a provider the user marked as their own, from user config only", () =>
  Effect.gen(function* () {
    yield* Effect.promise(() =>
      Bun.write(
        userConfig,
        JSON.stringify({
          hermit: { preset: "trusted" },
          provider: { test: { owner: "user", options: { baseURL: remote } } },
        }),
      ),
    )
    yield* provideTmpdirInstance(
      () =>
        Effect.gen(function* () {
          const { model, errors } = yield* ask()
          expect(model.boundary).toBe("user")
          expect(model.permitted).toBe(true)
          expect(errors).toEqual([])
          expect(hits).toHaveLength(1)
        }),
      { config: testProviderConfig(remote) },
    )
  }),
)

it.live("a project config cannot mark a provider as user-owned", () =>
  Effect.gen(function* () {
    yield* Effect.promise(() => Bun.write(userConfig, JSON.stringify({ hermit: { preset: "trusted" } })))
    yield* provideTmpdirInstance(
      () =>
        Effect.gen(function* () {
          const { model, errors } = yield* ask()
          expect(model.boundary).toBe("third-party")
          expect(errors[0]).toBeInstanceOf(HermitPolicy.DestinationError)
          expect(hits).toEqual([])
        }),
      {
        config: {
          ...testProviderConfig(remote),
          provider: { test: { ...testProviderConfig(remote).provider.test, owner: "user" } },
        },
      },
    )
  }),
)

it.live("a redirect from a local endpoint is refused before the target receives the context", () =>
  provideTmpdirInstance(
    () =>
      Effect.gen(function* () {
        const { errors } = yield* ask()
        expect(errors[0]).toBeInstanceOf(HermitPolicy.DestinationError)
        expect(hits).toEqual(["/redirect/chat/completions"])
      }),
    { config: testProviderConfig(`${local}/redirect`) },
  ),
)

it.live("a small_model on a remote provider is refused during a private session", () =>
  provideTmpdirInstance(
    () =>
      Effect.gen(function* () {
        const provider = yield* Provider.Service
        const small = yield* provider.getSmallModel(TEST)
        expect(String(small?.providerID)).toBe("remote")
        expect(small?.permitted).toBe(false)
        const result = streamText({
          model: yield* provider.getLanguage(small!),
          onError() {},
          messages: [{ role: "user", content: "title this" }],
        })
        const errors = yield* Effect.promise(async () => {
          const errors: unknown[] = []
          for await (const part of result.fullStream) if (part.type === "error") errors.push(part.error)
          return errors
        })
        expect(errors[0]).toBeInstanceOf(HermitPolicy.DestinationError)
        expect(hits).toEqual([])
      }),
    {
      config: {
        ...testProviderConfig(local),
        small_model: "remote/test-model",
        provider: {
          ...testProviderConfig(local).provider,
          remote: { ...testProviderConfig(remote).provider.test, id: "remote", name: "Remote" },
        },
      },
    },
  ),
)
