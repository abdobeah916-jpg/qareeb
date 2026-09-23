# Qareeb deployment and LAN runbook

## Permanent website

The permanent build expects the managed WebDev environment variables for MySQL, Manus OAuth, and Forge Storage. Use the project management interface to create a checkpoint, then use **Publish** from the latest checkpoint. The application does not require a custom domain to start; HTTPS is provided by the managed deployment URL, and a custom domain can be bound later from the Domains settings.

The production runtime uses the authenticated Manus OAuth session as the source of identity. Room messages, private messages, memberships, moderator invitations, notifications, activity records, profiles, and file metadata are stored durably in MySQL. Avatar and attachment bytes are kept in Forge Storage and are served through the authenticated storage proxy.

## Windows LAN mode

For the old offline/local-network workflow, open PowerShell in the folder that contains `package.json` and `dist/index.js`. Do not type `Run as administrator` into PowerShell; it is a Windows Explorer context-menu action. If the folder was extracted into a different location, locate it with:

```powershell
Get-ChildItem "$HOME\Downloads" -Directory -Recurse -Filter qareeb-lan -ErrorAction SilentlyContinue | Select-Object -First 5 -ExpandProperty FullName
```

Then run the commands from the actual folder:

```powershell
Set-Location "C:\path\to\qareeb-lan"
pnpm install
pnpm build
$env:LOCAL_MODE = "true"
$env:NODE_ENV = "production"
pnpm start:lan
```

The PowerShell environment-variable form is required on Windows; the Unix form `LOCAL_MODE=true pnpm start:lan` is not a valid PowerShell command. The server prints the active port when it starts. On the same Wi-Fi network, find the laptop IPv4 address with `ipconfig`, then open `http://<IPv4-address>:<printed-port>` on the phone. If Windows reports Error 5 while adding a firewall rule, open **Windows Terminal / PowerShell → Run as administrator** and add the rule there, or allow Node.js through the Private network profile in Windows Security. Keep the laptop and phone on the same private network.

The LAN build includes a `crypto.randomUUID` compatibility fallback using `crypto.getRandomValues`, followed by a non-cryptographic last-resort identifier for old browsers. The permanent HTTPS website uses the authenticated OAuth `openId` instead of a device-only identity.

## Realtime behavior in autoscale

MySQL is the source of truth for every message and administrative event. Socket.IO is used as a low-latency delivery hint, while the room/direct snapshots are periodically refreshed so a message remains visible even if a websocket is reconnected or routed to another instance. This is the safe baseline when no shared pub/sub connector is configured.

For deployments that require cross-instance sub-second socket delivery and cross-instance WebRTC signaling, configure a shared Socket.IO adapter backed by an approved Redis-compatible service and pass its connection through a server secret. The current build intentionally does not hardcode an external Redis endpoint or credentials. Until that adapter is supplied, durable messaging remains available through the database refresh path, while calls should be treated as best-effort on a multi-instance Autoscale deployment.

## Validation

Run `pnpm exec tsc --noEmit`, `pnpm test -- --run`, and `pnpm build` before publishing. The schema comparison utility is `scripts/verify-schema.mjs`; it is intended to be run against the managed database and its results are recorded in `SCHEMA_VERIFICATION.md`.


## True P2P mode

Qareeb now includes an opt-in **True local P2P** panel under Advanced tools. It creates a WebRTC `RTCPeerConnection` with an empty ICE server list, so no STUN, TURN, or public relay is configured. The two users exchange the generated offer and answer by copy/paste (or any local QR/text transport), then P2P messages travel over an ordered WebRTC DataChannel. The existing call UI still uses Qareeb signaling for negotiation; its media is direct when WebRTC succeeds, while a fully manual no-relay call handshake remains a separate follow-up.

The initiator selects **Create offer code**, sends the local code to the other device, and pastes the returned answer into the remote-code field. The receiver selects **Accept offer and create answer**, sends the resulting local code back, and the initiator selects **Apply answer**. The panel exposes connection state, malformed/non-local signal rejection, a session-only transcript, and JSON export/import. Closing either browser tab ends the P2P session; the transcript is not written to the Qareeb database.

This mode is intentionally different from the durable cloud chat. It requires both peers to be online at the same time and normally requires a host candidate reachable on the same Wi-Fi/LAN. If the network blocks direct host candidates, a relay would be required, which this mode deliberately does not configure. In that case use the existing durable HTTPS chat or the separate Windows LAN server workflow.
