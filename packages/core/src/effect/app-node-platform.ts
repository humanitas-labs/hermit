import { NodeFileSystem, NodePath } from "@effect/platform-node"
import { LLMClient, RequestExecutor } from "@opencode-ai/llm/route"
import { FileSystem, Layer, Path } from "effect"
import { FetchHttpClient } from "effect/unstable/http"
import { HttpClient } from "effect/unstable/http"
import { makeGlobalNode } from "./app-node"
import { HermitPolicy } from "../hermit/policy"

export const filesystem = makeGlobalNode({ service: FileSystem.FileSystem, layer: NodeFileSystem.layer, deps: [] })
export const path = makeGlobalNode({ service: Path.Path, layer: NodePath.layer, deps: [] })
export const httpClient = makeGlobalNode({ service: HttpClient.HttpClient, layer: FetchHttpClient.layer, deps: [] })
// Inference requests get their own HTTP client whose fetch is wrapped by the
// Hermit destination check. The shared `httpClient` above stays unguarded for
// tools and downloads, which are governed by permissions, not the boundary.
export const requestExecutor = makeGlobalNode({
  service: RequestExecutor.Service,
  layer: RequestExecutor.layer.pipe(Layer.provide(FetchHttpClient.layer.pipe(Layer.provide(HermitPolicy.fetchLayer)))),
  deps: [],
})
export const llmClient = makeGlobalNode({ service: LLMClient.Service, layer: LLMClient.layer, deps: [requestExecutor] })

export * as LayerNodePlatform from "./app-node-platform"
