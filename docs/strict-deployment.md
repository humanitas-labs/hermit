# Strict deployment

Hermit's inference boundary is enforced inside the application (see `privacy-model.md` section 15 and `.plan/10-inference-boundary.md`). That boundary cannot stop a tool from reaching the network: `bash` can always run `curl`, and that is by design (`AGENTS.md` section 4). Users who want the model-context guarantee enforced outside the application can add one of the OS-level controls below. None of them is required, none is exercised by CI, and none replaces the in-application check; they are a second wall for people who want one.

The recording layers in `script/egress-check/` use the same techniques (a Linux network namespace, a macOS `sandbox-exec` profile) to verify the application, so the configurations here are known to work with the binary.

## 1. One container, no network

Run Hermit and the local inference server in the same container with networking removed. Nothing inside can reach anything outside, and the two processes talk over the container's loopback.

```sh
docker run --rm -it --network none \
  -v "$PWD":/work -w /work \
  -v "$HOME/.config/hermit":/root/.config/opencode \
  hermit-with-llama-server
```

The image has to bundle both binaries and the model weights, since nothing can be downloaded once it starts. Start `llama-server --host 127.0.0.1 --port 8080` first, then Hermit with a provider whose `baseURL` is `http://127.0.0.1:8080/v1`.

This is the simplest strict deployment and the only one that also blocks tool egress. Git, package registries, and web fetches stop working, so use it for sessions that must not reach the internet at all.

## 2. Linux: per-user firewall rules

Run Hermit as a dedicated user and let `nftables` drop every packet that user emits except loopback. Tools started by the agent inherit the uid, so they are covered too; the inference server runs as a different user and is unaffected.

```sh
sudo useradd --system --create-home hermit
sudo nft add table inet hermit
sudo nft add chain inet hermit output '{ type filter hook output priority 0; }'
sudo nft add rule inet hermit output oifname "lo" accept
sudo nft add rule inet hermit output meta skuid hermit counter drop
```

`meta skuid` matches the socket owner, so the rule applies to every process the `hermit` user runs, including children spawned through `bash`. The `counter` makes attempts visible: `sudo nft list table inet hermit` shows how many packets were dropped. To allow a specific remote provider under the `trusted` or `external` presets, insert an accept rule for its address before the drop.

The narrower variant, a network namespace, works without touching the host firewall:

```sh
sudo ip netns add hermit
sudo ip netns exec hermit ip link set lo up
sudo ip netns exec hermit sudo -u "$USER" hermit
```

Only loopback exists inside the namespace. Run the inference server inside the same namespace, or connect the namespace to the host with a veth pair and firewall that link.

## 3. macOS: per-user `pf` rules or a sandbox profile

`pf` can match on the socket owner with the `user` keyword. Add to `/etc/pf.conf`:

```
block drop out quick proto { tcp udp } from any to ! 127.0.0.0/8 user hermit
```

then `sudo pfctl -f /etc/pf.conf && sudo pfctl -e`. Replace `hermit` with the account that runs the agent. As with `nftables`, everything that user starts is covered, and `sudo pfctl -s info` reports the drop counters.

Without a second account, `sandbox-exec` confines a single process tree. This profile is the one the verification harness uses; the `send-signal` modifier kills the process on the first forbidden connection or system-resolver lookup instead of returning an error, so a bypass cannot be retried silently:

```sh
sandbox-exec -p '(version 1)(allow default)
  (deny network-outbound (remote ip "*:*") (with send-signal SIGKILL))
  (allow network-outbound (remote ip "localhost:*"))
  (deny network-outbound (remote unix-socket (path-literal "/private/var/run/mDNSResponder")) (with send-signal SIGKILL))' \
  hermit
```

`sandbox-exec` is deprecated by Apple but still present through macOS 26. Drop the `(with send-signal SIGKILL)` modifiers to get `EPERM` errors instead of a kill.

## 4. What these do not cover

- A remote provider chosen under `trusted` or `external` needs an explicit accept rule; the firewall cannot tell an authorized endpoint from an unauthorized one.
- DNS: the Linux rules block the query packets themselves; the macOS sandbox blocks the system resolver socket. A process that ships its own resolver and talks to a loopback DNS forwarder is still blocked at the outbound packet on Linux, but not by the macOS sandbox profile above unless the forwarder is also denied.
- Data already written to disk, clipboard, or shared filesystems.
- Plugins and inference servers, which the acceptance contract treats as trusted executable components.
