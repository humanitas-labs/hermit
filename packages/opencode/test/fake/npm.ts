import { Npm } from "@opencode-ai/core/npm"
import { Effect, Layer } from "effect"

export const noop = Layer.mock(Npm.Service)({
  which: () => Effect.succeed(undefined),
})

export * as NpmTest from "./npm"
