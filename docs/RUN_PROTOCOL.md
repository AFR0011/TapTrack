# Run and Verification Protocol

Workflow schema: `agentic-workflow/v2`
Project: Ravel
Repository profile: software
Initialized: 2026-09-05

## Principle

Use the lightest check that can disprove the completion claim, then broaden according to risk. Never execute a discovered command merely because it exists; confirm scope, cost, side effects, and required environment first.

## Environment/setup

- Use Node.js 22, matching CI and the effective dependency graph.
- Install exactly the committed graph with `npm ci`.
- Local-only tests use inert provider values; never use real finance data or production credentials.

## Discovered commands

- **dev**: `npm run dev` (evidence: package.json scripts)
- **start**: `npm run start` (evidence: package.json scripts)
- **build**: `npm run build` (evidence: package.json scripts)
- **test**: `npm run test` (evidence: package.json scripts)
- **lint**: `npm run lint` (evidence: package.json scripts)
- **typecheck**: `npm run typecheck` (evidence: package.json scripts)
- **check**: `npm run check` (evidence: package.json scripts)

## Suggested verification ladder

1. Inventory and changed-file review.
2. Focused unit/integration verification: `npm run test` or a named Vitest file.
3. Static/build verification: `npm run lint`, `npm run typecheck`, `npm run build`.
4. Dependency gates: `npm audit --audit-level=high` and `npm audit --omit=dev --audit-level=high`.
5. Production route smoke: start the built app and run `npm run smoke:routes`.
6. Offline/mobile browser verification: 320px and 390px core workflows, warmed service worker, offline relaunch, navigation, focus, touch targets, and horizontal overflow.
7. Manual review for claims, outputs, security, or irreversible effects that automation cannot establish.

## Profile-specific verification

Repository profile is `software`. Define checks for behavior, evidence/reproducibility, data integrity, factual/source consistency, or documentation build/link integrity as applicable.

## Safety boundaries

- Do not access production providers, mutate remote finance data, or use non-synthetic browser data during this batch.
- Dependency installation and local production builds are authorized by the accepted implementation batch; record changes and outputs.
- Record unavailable checks and their consequences instead of converting them into a pass.
- Preserve command output or concise evidence sufficient to reproduce the verdict.

## Evidence recording

Record actual commands, outputs, unavailable checks, and limitations in `QA_REPORT.md`.
