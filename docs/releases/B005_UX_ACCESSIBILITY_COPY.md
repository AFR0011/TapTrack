# TT-B005 — UX, Accessibility & Product-Language Hardening

## Objective

Polish TapTrack without redesigning the product or changing B004 behavior. B005 keeps the current calm, utility-first visual direction and focuses on interaction rigor, accessibility, information architecture, and user-facing language.

## Design principle

User-facing copy should describe the user's money, actions, choices, and consequences. It should not narrate storage, networking, database, synchronization, API, or implementation details unless those details are necessary for an informed decision.

Examples:

- Prefer **"Your data on this device"** over **"local ledger"**.
- Prefer **"Your synced account"** over **"cloud ledger"**.
- Prefer **"Sync is unavailable right now"** over **"provider unavailable"**.
- Prefer **"Some currencies could not be included"** over implementation-level exchange-rate fallback language.
- Preserve technical detail only where it changes financial meaning, such as the date/rate used for a currency conversion or the scope of a destructive restore/reset.

## Scope

### Accessibility and interaction

- WCAG AA contrast for normal text and action states.
- 44px minimum interactive targets.
- 16px mobile form text where needed to prevent browser zoom.
- Skip-to-content and predictable keyboard focus.
- Reduced-motion behavior across app motion, not only animated numbers.
- Semantic forms and field-level validation for high-frequency entry flows.
- Accessible progress bars and report/chart alternatives.
- Shared modal/sheet focus behavior.

### Information architecture

- Keep transaction capture separate from the dashboard.
- Reorganize Settings around Personalization, Capture, Ledger, Account & Sync, Data, and Danger Zone.
- Put currency controls with Personalization instead of after destructive data controls.
- Reduce destructive-action prominence in everyday lists.

### Visual system

- Keep Inter, current spacing/radius language, restrained cards, and light/dark support.
- Split text/foreground semantic colors from filled-action colors where contrast requirements differ.
- Keep one clear primary action per screen.
- Do not introduce decorative gradients, glassmorphism, or dashboard-card inflation.

### Product-language cleanup

Audit all user-facing strings for:

- implementation terminology,
- developer/debug wording,
- storage/sync internals,
- vague errors with no recovery path,
- stale references to removed UI,
- overly technical currency-rate explanations,
- labels that describe system operations instead of user outcomes,
- inconsistent terminology for device/account/sync/currency concepts.

## Non-goals

- No B004 functional changes.
- No new data model or migration.
- No full visual redesign.
- No new AI surface.
- No production deployment before B004 is merged and B005 passes its own release gate.

## Release gate

- Lint, typecheck, unit tests, build green.
- Mobile Playwright at 320px and 390px.
- Keyboard navigation pass for primary flows.
- Light/dark contrast audit for actionable text.
- Reduced-motion pass.
- Copy audit complete with no avoidable implementation-level language in ordinary UI.
- Current-head Vercel preview smoke-tested before merge.
