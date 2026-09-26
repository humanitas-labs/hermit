import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const dir = path.resolve(__dirname, "..")

process.chdir(dir)

// Hermit: the catalog is frozen into the binary at build time. The build
// machine fetches models.dev when it can and falls back to the checked-in
// snapshot so offline builds stay reproducible. OpenCode-hosted providers are
// dropped before embedding.
const snapshot = path.join(dir, "script", "models.json")
const source = process.env.MODELS_DEV_API_JSON
  ? await Bun.file(process.env.MODELS_DEV_API_JSON).text()
  : await fetch("https://models.dev/api.json")
      .then((x) => (x.ok ? x.text() : Promise.reject(new Error(x.statusText))))
      .catch(() => Bun.file(snapshot).text())
const filtered = Object.fromEntries(
  Object.entries(JSON.parse(source) as Record<string, unknown>).filter(([id]) => !id.startsWith("opencode")),
)
export const modelsData = JSON.stringify(filtered)
console.log(`Loaded models.dev snapshot (${Object.keys(filtered).length} providers)`)
