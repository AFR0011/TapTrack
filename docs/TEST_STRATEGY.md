# Test Strategy

Verification proceeds from narrow deterministic checks to the complete local product story.

1. Focused Vitest tests cover database migrations, immutable ledger binding, centralized sync
   authorization, auth-optional routing, and fail-closed Telegram configuration.
2. The complete Vitest suite protects local finance behavior and server route contracts.
3. ESLint and TypeScript verify static correctness; `next build` verifies production compilation.
4. Production route smoke verifies public local-app routing without provider credentials.
5. Playwright Chromium runs at 320x720 and 390x844 after warming the service worker. It exercises
   all seven core routes, offline relaunch/navigation, local transaction persistence, 44x44 targets,
   and horizontal overflow.
6. Both full and production dependency audits must have no High/Critical findings.

Tests use absent/inert provider configuration and synthetic finance data. They must not contact live
Supabase or Telegram services or retain screenshots/traces containing real data. Native Safari/iOS,
live provider schema/RLS, and production deployment remain explicit residual verification gaps.
