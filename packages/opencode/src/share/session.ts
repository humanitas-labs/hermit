import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Context, Effect, Layer } from "effect"
import type { SessionID } from "@/session/schema"

// Hermit has no session share transport. This stub exists only so `cli/cmd/github.handler.ts`
// keeps compiling until plan 08 deletes that command; every call fails.
export interface Interface {
  readonly share: (sessionID: SessionID) => Effect.Effect<never, Error>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/SessionShare") {}

const layer = Layer.succeed(
  Service,
  Service.of({
    share: () => Effect.fail(new Error("Session sharing is not available in Hermit")),
  }),
)

export const node = LayerNode.make({ service: Service, layer: layer, deps: [] })

export * as SessionShare from "./session"
