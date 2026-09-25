// Deliberate proxy bypass. Opens a raw TCP connection to a TEST-NET address on
// 443, ignoring HTTP(S)_PROXY entirely. The harness must record this attempt
// through its namespace-level layer (sandbox denial on macOS, sink on Linux);
// if it does not, the run fails. This proves the harness can see traffic that
// never touches the proxy.

const target = { hostname: "192.0.2.1", port: 443 }
const outcome = await Bun.connect({
  ...target,
  socket: {
    open(socket) {
      socket.end()
    },
    data() {},
    error() {},
    connectError() {},
  },
})
  .then(() => "connected")
  .catch((error: Error) => `blocked: ${error.message}`)
console.log(`bypass fixture: raw connect to ${target.hostname}:${target.port} -> ${outcome}`)
