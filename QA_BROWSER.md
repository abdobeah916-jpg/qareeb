# Browser QA Notes

## 2026-08-27

The Qareeb preview loaded successfully after the server restart at the existing preview URL. The Arabic landing page rendered with the onboarding fields, room/private-chat call-to-action, bilingual switch, and responsive visual layout. No runtime error was visible in the page content.

The English switch was exercised in the browser. It changed the page direction/content to English and translated the main onboarding labels, profile fields, availability/privacy options, feature cards, and action buttons. The preview displayed the English layout without a visible runtime error.

Remaining validation limitation: the protected room view was not re-entered in this browser pass because it requires the persisted OAuth session/profile flow. Server-side Vitest coverage and the existing room smoke test cover the protected message contracts.

The post-build reload remained healthy: the English landing screen still exposed the language toggle, OAuth entry action, profile inputs, availability/privacy selects, and start actions with the expected English labels. No visible runtime error appeared during the reload/view pass.

The managed preview was checked at 375x812 and 1280x720 after the search/admin refinements. The mobile view keeps the bilingual header controls, onboarding card, fields, selects, and action buttons within the viewport with no visible horizontal overflow. The desktop view preserves the intended asymmetric hero composition and readable Arabic hierarchy. No runtime error was visible in either screenshot.

Keyboard check on the public onboarding page: after pressing Tab, focus moved to the availability select and remained visibly outlined, confirming the global focus-visible treatment is active on native form controls. The authenticated room/direct/call pass still requires the owner's OAuth session and permissions.

Final visual regression check after the last English-mode translation pass: at 375x812 the onboarding form remains contained and readable; at 1280x720 the asymmetric hero, profile card, and controls retain their hierarchy. The preview reports no TypeScript errors and no visible runtime error. Authenticated room keyboard verification remains dependent on the owner's OAuth browser session.

Authenticated My Browser check: the OAuth session opened /chat successfully with the persistent profile `abdobeah7`. The room shell rendered with navigation, room code, message composer, mute, invite/join, notifications, people, and private-chat controls. No visible runtime error appeared; the room was still loading its server snapshot at capture time.

Authenticated keyboard pass: after entering /chat in My Browser and pressing Tab, focus remained within the visible room navigation/control sequence and the room transitioned to “Connected in real time.” The room exposed focusable controls for tabs, profile/language, notifications, search, settings, room creation/info, attachment, composer, send, mute, join, read-all, private chat, and browser notifications. The captured room currently has one participant and no messages, so reply/reaction controls were not exercised in this pass.

Sequential Tab navigation successfully moves focus through the sidebar tabs (Conversations, People, Files, Services), the profile menu, the top action bar (Language, Notifications, Search, Settings, New Room, Room Info), the room code copy button, the message composer, and the sidebar controls (Mute, Join, Read All, Private Chat). Focus outlines remain visible and logical order is preserved.

Further authenticated keyboard check: Enter on the focused navigation control did not trigger a destructive action, and the following Tab moved the visible focus outline from the People navigation item to Files in the logical sidebar order. This confirms the tab controls are keyboard reachable and the focus indicator remains visible. The remaining optional direct/call branches could not be populated because this account is the only participant in the test room.

English fallback verification: after the latest Home change, the room heading correctly renders `Room P4C-2C2` instead of the persisted Arabic default `غرفة قريب`. However, a subsequent HMR/reload restored the page locale to Arabic from the account profile before the manual language update completed, so language-race handling remains under active verification.

Language-race regression resolved: in the authenticated My Browser session, manually switching to English now remains stable after the profile query settles. The room heading renders `Room P4C-2C2`, the room management card renders English labels and the default input shows `Qareeb room`, and the empty notifications/people/activity states remain English.

Authenticated settings focus check: after opening Profile & settings, pressing Tab moved focus to the next top action (New room) with a visible outline; the settings controls themselves expose accessible labels and radio roles for appearance/background choices. This confirms keyboard entry into settings, while a full end-to-end keyboard pass through private-call controls still depends on having a second participant.

Authenticated settings control pass: the `Dark mode` control was activated successfully and its accessible name changed to `Dark mode enabled`; the palette visibly changed to a dark surface with readable contrast. The control remained reachable with a visible focus outline. Next, the appearance radio choices and reading background/compact controls will be traversed using keyboard navigation.

Keyboard settings pass: from the focused Dark mode control, Tab moved to the `Quiet noir` appearance radio and Enter activated it without leaving the page. The dark palette remained readable, the radio controls stayed keyboard reachable, and focus outlines/accessible role labels remained visible in the authenticated settings view.

The appearance radio buttons (Quiet noir, Balanced ocean, Natural sage) are fully keyboard reachable. Tab moves focus sequentially through the options, and the focus outline is clearly visible against the dark background.

Browser extension note: the My Browser extension timed out while activating the next appearance radio option, after the successful Quiet noir activation. The last reliable authenticated state remains the dark Quiet noir settings page; no destructive action was attempted. A follow-up re-view also timed out, so further live-browser verification is deferred until the browser session responds again.

Expansion verification note: desktop screenshots at 1280x720 show the existing asymmetric landing page and authenticated room shell retaining their visual hierarchy after AdvancedToolsView, message actions, and mention UI were added. Mobile screenshot at 390x844 keeps the room header, message surface, and bottom navigation contained without horizontal overflow. The current sandbox preview reports no TypeScript errors; authenticated AdvancedToolsView interaction still requires the owner's responsive OAuth browser session for end-to-end confirmation.

Latest visual verification after global analytics, device-test, direct-message pinning, and preference-sync changes: the public onboarding and /chat preview remained readable at 1280x720 and 390x844, with no visible horizontal overflow. The sandbox browser was not authenticated, so the owner-only AdvancedToolsView and camera/microphone test button could not be exercised interactively; the TypeScript/build checks and abuse-event unit test passed.

Final visual pass after the PWA, resumable-upload-session, spam-detection, multi-pin, preference-sync, and call-diagnostics refinements: `/` and `/chat` rendered successfully at 1280x720. The Arabic landing state preserved the asymmetric hero, profile form hierarchy, readable contrast, and English switch. The chat shell preserved RTL navigation, central empty conversation state, left-side room tools, alerts, invite card, and composer with no visible overflow. PWA install, camera/microphone permission, and two-user realtime call behavior still require an authenticated device/browser to exercise interactively.


## Final verification addendum — 27 August 2026

The final code-path verification passed with `pnpm check`, 39 Vitest tests, and a production build. The public Arabic onboarding and chat routes were also checked at desktop and narrow mobile viewports without visible horizontal overflow.

The upload flow now persists an `uploadSessions` record plus one durable `uploadChunks` record per part. Selecting the same file again reuses the locally remembered session identifier; already stored chunk indexes are acknowledged without duplicate storage, missing chunks are rejected at finalize time, and only a complete object is attached to the message. This is a contract-level verification; a large transfer still needs to be exercised with a real authenticated browser and an interrupted network connection.

Device revoke and revoke-all now close active Socket.IO connections in addition to blocking subsequent authenticated requests through the database-backed middleware. The receiving client should reconnect only after the device has been registered again.

The remaining browser-only checks are intentionally explicit: authenticated AdvancedToolsView Arabic/English RTL/LTR traversal, real PWA installation and offline recovery, camera/microphone permission prompts, and a two-user public call. The unauthenticated sandbox cannot honestly certify those flows.

| Area | Verified in sandbox | Requires authenticated browser |
|---|---:|---:|
| TypeScript, unit contracts, production build | Yes | No |
| Desktop/mobile public rendering | Yes | No |
| Resumable chunk persistence contract | Yes | No |
| Immediate revoke of active realtime sessions | Yes, code path | No |
| Advanced tools RTL/LTR interaction | No | Yes |
| PWA install/offline transition | No | Yes |
| Media permissions and two-user call | No | Yes |

## Manual owner pass

Sign in at the permanent HTTPS URL, open **Advanced tools**, switch between Arabic and English, and confirm that labels, cards, focus rings, and action buttons remain readable in RTL and LTR. In **Settings**, tab through the reading-density and reading-background controls and activate each with Space. From a Chromium install-capable browser, install Qareeb, disable the network, confirm the offline shell appears, then restore the network and confirm the chat snapshot refreshes. Finally, use two authenticated devices to verify call permissions and revoke-all behavior.


## True P2P verification procedure

The True local P2P panel is a manual two-device flow. On device A choose **Create offer code**; transfer the generated text through a local channel such as nearby copy/paste or a QR encoder; on device B choose **Accept offer and create answer** and return the answer; on device A choose **Apply answer**. Verify that the state becomes directly connected and that a message sent from either device appears only in the local P2P transcript. For audio/video, use the dedicated P2P audio/video offer buttons and approve the browser media permission on both devices.

The implementation deliberately uses an empty ICE server list. Therefore, this test must use a Wi-Fi/LAN where host candidates can reach one another. A failed or disconnected state is expected on networks that isolate clients or require a relay; the panel exposes a retry/reset action and does not silently fall back to an Internet relay. This two-device verification was not executable in the sandbox browser because it has no second physical peer; it remains an owner-run acceptance test.


## Latest visual P2P pass

The public landing route and `/chat` rendered at 1280×720 after the transport integration. The authenticated-looking chat shell showed the Cloud/Local P2P selector immediately above the composer; the selected Cloud state was visibly highlighted and the Local P2P option remained readable. The sidebar, room content, composer, and controls stayed within the viewport without visible horizontal overflow. This remains a visual check only; direct P2P connectivity still requires two physical devices on the same Wi-Fi.


## PWA manifest route check

The published HTML references `/manifest.json`; that route responds successfully with the bilingual app name, `/chat` start URL, standalone display mode, scope `/`, theme/background colors, and `/icon.svg`. The alternate `/manifest.webmanifest` path is not part of this app and correctly returns the application 404 page. Actual install prompt and offline transition remain device/browser acceptance checks.
