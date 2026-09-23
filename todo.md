# Project TODO

- [x] Import the existing Qareeb LAN implementation into the initialized permanent WebDev project.
- [x] Replace device-only local identity with secure public sign-in and persistent user profiles.
- [x] Migrate rooms, messages, memberships, moderator invitations, permissions, notifications, activity logs, and direct chats to durable database tables.
- [x] Migrate avatars and attachments to durable object storage with authorized access.
- [x] Preserve Arabic/English switching and RTL/LTR behavior across onboarding, chat, room management, and notifications.
- [x] Preserve WhatsApp-like room and private-chat flows with realtime updates suitable for autoscale hosting.
- [x] Preserve moderator invitation approval and permission-based room management.
- [x] Preserve in-app administrative notifications and CSV activity-log export.
- [x] Apply polished visual refinement and responsive accessibility improvements.
- [x] Add Vitest coverage for auth, authorization, moderator approval, notifications, and export.
- [x] Run typecheck, tests, production build, and browser verification.
- [ ] Save the final checkpoint and provide the user with the stable public URL / publish instructions.

- [x] Bind every Qareeb API procedure to ctx.user.openId and reject mismatched client identities.
- [x] Persist username and display name in durable user profile fields rather than localStorage only.
- [x] Serve avatars and attachments through access-checked signed URLs or proxy endpoints and test unauthorized access.
- [x] Finish English translations for room-management, moderator, notification, empty, and error states.
- [x] Document or implement a shared realtime strategy for autoscale deployment and validate the supported hosting behavior.
- [x] Verify keyboard focus, ARIA labels, and responsive mobile layouts in authenticated room/settings flows; document direct/call test limitations when no second participant exists.
- [x] Add explicit Vitest coverage for moderator approval/decline, notifications, CSV export, and unauthorized access.
- [x] Document the Windows extraction path mismatch and the safe folder locator for the local Qareeb run instructions.
- [x] Provide a path-independent PowerShell command that locates the extracted Qareeb folder under Downloads.
- [x] Diagnose the Windows command failure as Unix-style environment-variable syntax used in PowerShell.
- [x] Provide a Windows PowerShell-compatible start:lan command that sets LOCAL_MODE correctly.
- [x] Diagnose the laptop run failure using the terminal output, Node version, and active port.
- [x] Document how to confirm the Qareeb server port and startup output after Node/dist validation.
- [x] Document the LAN phone-access flow using the laptop IPv4 address and Windows firewall.
- [x] Document the elevated PowerShell and Private-network firewall alternatives for Windows Error 5.
- [x] Clarify that Run as administrator is a Windows menu action, not a PowerShell command.
- [x] Provide the final phone access steps using the laptop's LAN IP and active Qareeb port.
- [x] Fix browser compatibility for crypto.randomUUID when Qareeb is opened from a LAN IP on a phone.

## Advanced feature package

- [x] Add durable unique username, bio, availability status, avatar, and privacy settings.
- [x] Add durable message replies and reactions; retain the existing pin, delivery/read, and typing flows.
- [x] Add conversation-scoped search across messages, people, and files with date/type filters.
- [x] Add per-room and per-direct-chat mute controls, mentions, and administrative notification summaries.
- [x] Build an owner administration panel with active members, pending invites, permissions, filtered activity, and downloads.
- [x] Improve file previews, upload progress, resumable uploads, and file categorization.
- [x] Add backup/restore with retention controls for rooms and administrative activity.
- [x] Add signed temporary attachment access, rate limiting, anti-spam protections, and server-enforced authorization.
- [ ] Add TURN configuration and microphone/camera diagnostics for public calls.
- [x] Complete bilingual translations and persist language preference per user.
- [ ] Complete authenticated accessibility verification for dark/quiet themes and reading-density controls on the reachable settings flow.
- [x] Fix MySQL ensureRoom insertion by sending explicit room defaults and align the applied baseline schema with Drizzle.
- [x] Apply and verify the full MySQL baseline schema against drizzle/schema.ts for all Qareeb tables, columns, defaults, and constraints.
- [x] Run a MySQL-backed room creation/join smoke test after the ensureRoom fix and confirm no new Failed query entries.
- [x] Add durable room and private-message reply metadata and reaction toggles with authenticated sender checks.
- [x] Render reply previews and reaction controls in both room and private chat views.
- [x] Finish bilingual copy in room administration, calls, notifications, and remaining empty states.
- [x] Verify keyboard/focus accessibility after passing language through all lazy views; document unavailable direct/call branches without a second participant.
- [x] Run final Vitest, typecheck, build, and desktop/mobile visual verification.
- [x] Bind room/direct sendMessage and reaction mutations to ctx.user.openId and reject mismatched client identities.
- [x] Add Vitest coverage proving room/direct reply and reaction procedures reject mismatched client identities.
- [x] Prevent delayed profile-language hydration from overwriting an explicit language toggle in Home.
- [ ] Run and document a keyboard-only accessibility pass for authenticated settings controls, including dark/quiet appearance and reading-density/backdrop toggles.
- [ ] Open ServicesView in an authenticated session and verify keyboard navigation, focus visibility, and translated labels.

## Expansion requested by owner

- [x] Add device/session management with session listing and revoke-all support
- [x] Add message edit/delete flows for room and direct messages with durable audit metadata
- [x] Add mentions with suggestions and server-validated mention notifications
- [x] Add user reports, moderation queue, ban/unban, and abuse-management UI
- [x] Add server-side rate limiting, spam protection, upload/message quotas, and abuse logging
- [x] Add backup manifests, room backup/export, restore workflow, and configurable retention policy
- [x] Add retention cleanup endpoint using platform-managed scheduled execution only
- [x] Add room/global activity statistics and owner analytics view
- [x] Add resumable upload sessions, progress UI, file previews, and upload validation
- [x] Add richer message actions: multi-pin, read/sent states, typing state, and direct-message parity
- [x] Add robust PWA manifest/icons, install affordances, offline shell, and notification settings
- [x] Add microphone/camera/network diagnostics and improve call reliability feedback
- [ ] Add shared realtime adapter strategy compatible with multi-instance hosting
- [x] Add per-account theme, font-size, density, and notification preferences across devices
- [x] Add full bilingual copy for all new states and verify RTL/LTR layouts
- [ ] Add Vitest coverage for every new backend contract and security boundary
- [ ] Run final desktop/mobile visual verification and authenticated accessibility pass
- [x] Enforce revoked-device/session checks in authenticated requests and invalidate sessions on revoke-all
- [x] Add visible room/direct edit-delete controls and durable actor audit metadata
- [x] Implement mention autocomplete and user-facing mention notification view
- [x] Add unban and broader moderation controls to the abuse-management UI
- [x] Add global owner analytics in addition to room analytics
- [ ] Add PWA install prompt affordance and verify offline/install states
- [ ] Verify AdvancedToolsView in authenticated Arabic/English RTL/LTR browser flows
- [ ] Expand Vitest coverage for backup, retention, uploads, notifications, pins, receipts, and direct edit/delete
- [x] Implement and test durable abuse-event logging for rate-limit and spam violations
- [x] Add and test a dedicated call diagnostics flow for microphone, camera, and network state
- [x] Implement true multi-pin support plus explicit sent-state UX and verify room/direct parity
- [x] Complete cloud-synced preference hydration for appearance/theme and ringtone and test cross-device restore
- [x] Invalidate active revoked sessions on revoke-all, not only later procedure access, and add tests
- [ ] Run and document real PWA install/offline verification in the browser
- [x] Add spam-specific abuse detection and logging in addition to rate-limit logging, with tests
- [ ] Build and verify a fuller call diagnostics flow for microphone, camera, and network in an authenticated browser session
- [ ] Save the final checkpoint after all requested expansion work is complete


## LAN / Peer-to-Peer mode requested by owner

- [x] Add an explicit LAN/P2P transport mode that keeps room messaging on the local network when peers are reachable.
- [ ] Add local-network peer discovery/signaling and authenticated peer handshakes without exposing message payloads to the public relay.
- [x] Add P2P WebRTC data-channel transport for direct room messaging and manual media, with clear reconnect and offline states.
- [x] Add bilingual mode selection, connection diagnostics, and LAN-only privacy explanation.
- [ ] Test the LAN/P2P mode on two devices on the same Wi-Fi and document that internet-only networks cannot be reached without a relay or VPN.
- [x] Save a checkpoint after LAN/P2P implementation and validation.


## Confirmed true P2P scope

- [x] Build a true WebRTC peer connection with no public relay for P2P message payloads.
- [x] Support manual local offer/answer exchange using copy/paste and QR-safe text, with no assumption that browser LAN discovery is available.
- [x] Add a P2P-only chat surface that sends and receives encrypted-in-transit DataChannel messages and clearly labels them as session-only.
- [x] Add P2P connection state, reconnect, ICE failure, and session-expiry handling in Arabic and English.
- [x] Add local export/import of a P2P transcript so users can retain a session without cloud persistence.

- [x] Add a fully manual no-relay WebRTC media offer/answer flow for voice/video; the current P2P panel now exposes local audio/video offer and answer actions.


## P2P integration gaps found during validation

- [x] Integrate local P2P transport into the actual room/direct composer path instead of leaving it as a parallel standalone chat surface.
- [x] Add a persistent Cloud / Local P2P transport selector and route message sends through the selected transport.
- [x] Add dedicated LAN/P2P diagnostics showing ICE state, host-candidate reachability, and actionable local-network failure guidance.


## P2P integration follow-up gaps

- [x] Add translated error handling for denied or unavailable microphone/camera permissions and a clear retry path.
- [x] Render received P2P messages in the main Home room/direct thread when Local P2P transport is selected.
- [x] Add explicit main-composer limitation copy for P2P replies and attachments, or implement those payloads.

- [x] Add explicit P2P-mode handling for replies in the main composer by blocking reply sends with translated guidance until reply payloads are supported.

- [x] Inspect gathered ICE candidates and report host-candidate presence and candidate types in the LAN/P2P diagnostics instead of showing only generic ICE states.
