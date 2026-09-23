# Qareeb accessibility audit

## Scope

This audit covers the onboarding surface and the shared UI primitives used by the chat, search, files, calls, and room-management views. It is a code and browser review, not a certification against every WCAG success criterion.

## Findings addressed

All interactive controls use native buttons, inputs, selects, labels, links, or file inputs. Form labels are associated through `htmlFor` where an explicit association is needed, while grouped date filters and profile controls use label wrapping. Icon-only controls expose a `title` and/or `aria-label`; call controls expose `aria-pressed` when they represent a toggle. Message and notification regions use `aria-live` for changing content, and tabs expose `role="tablist"`, `role="tab"`, and `aria-selected`.

Global CSS provides a visible three-pixel `:focus-visible` outline with offset for buttons, inputs, links, and labels. The global reduced-motion rule disables nonessential transitions and message entrance animations when `prefers-reduced-motion: reduce` is enabled. Color pairs were checked against the light and dark semantic surfaces used by the application, and the search, date-filter, activity-filter, and reaction controls include dark-mode states.

The preview was inspected at 375x812 and 1280x720. The mobile layout collapses the sidebar into a bottom navigation, keeps the onboarding card within the viewport, and does not show horizontal overflow in the checked surface. The desktop layout preserves the asymmetric hero composition and readable content hierarchy. The public preview rendered without a visible runtime error in both sizes.

## Follow-up recommendation

A full keyboard-only pass through an authenticated room, including OAuth redirect and WebRTC permission prompts, should be performed by the owner after publishing because those flows depend on the owner's browser session and real camera/microphone permissions. The current source-level labels and focus styling are in place for that pass.


## Final verification addendum — 27 August 2026

The authenticated settings view has visible focus treatment and keyboard-reachable appearance radios. The remaining manual accessibility check is specifically to tab through the reading-density and reading-background controls and activate each with Space while confirming the visual state changes. This cannot be certified from the unauthenticated sandbox alone.

The owner should also repeat the pass after switching the interface to English and Arabic, because the layout direction changes and the AdvancedToolsView includes owner-only controls that are not present on the public onboarding route. No accessibility claim is made here for camera/microphone permission prompts or PWA installation UI until those browser-native flows are exercised in an authenticated browser.
