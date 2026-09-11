# Repository Profile

Workflow schema: `agentic-workflow/v2`
Project: Ravel
Repository profile: software
Initialized: 2026-09-05

## Classification

- Primary type: `software`
- Secondary traits: local-first PWA, financial data, optional cloud sync, mobile-first UI
- Confidence: high
- Files scanned: 127
- Scan truncated: False

## Evidence

```json
{
  "software": [
    "file:package.json",
    "dir:src",
    "dir:lib",
    "dir:api",
    "dir:app",
    "dir:test",
    "ext:.ts(50)",
    "ext:.tsx(40)",
    "ext:.js(1)",
    "keywords:route,component,service,migration"
  ],
  "writing": [
    "dir:scripts"
  ],
  "documentation": [
    "dir:docs"
  ]
}
```

## Existing governance discovered

- AGENTS.md
- BLUEPRINT.md
- docs/REPO_MAP.md
- docs/PROJECT_STATE.md
- README.md

## Discovered entry points

- `package.json`
- `app/page.tsx`
- `proxy.ts`
- `app/(authenticated)/app/page.tsx`
- `app/providers/DatabaseProvider.tsx`
- `src/database.ts`
- `public/sw.js`

## Discovered commands

- **dev**: `npm run dev` (evidence: package.json scripts)
- **start**: `npm run start` (evidence: package.json scripts)
- **build**: `npm run build` (evidence: package.json scripts)
- **test**: `npm run test` (evidence: package.json scripts)
- **lint**: `npm run lint` (evidence: package.json scripts)
- **typecheck**: `npm run typecheck` (evidence: package.json scripts)
- **check**: `npm run check` (evidence: package.json scripts)

## Protected/generated boundaries

### Protected candidates

- `.env*` and provider/deployment configuration
- `src/database.ts`, `src/sync/**`, `supabase/migrations/**`
- `app/api/telegram/**`
- user IndexedDB, exports, screenshots, and real finance data
- private rewrite rollback material outside the repository

### Generated-output candidates

- `.next/`
- `node_modules/`
- `coverage/`, `playwright-report/`, `test-results/`
- `tsconfig.tsbuildinfo`

## Equivalent-file mappings

- `PUBLICATION.md` and `SECURITY.md` supplement release/security policy but do not replace active workflow state.
- `docs/PRODUCTION_CHECKLIST.md` supplements `docs/RUN_PROTOCOL.md`.

## Profile review

- [x] Primary type and traits confirmed by repository evidence and owner-approved scope.
- [x] Authority and protected paths reconciled.
- [x] Required commands confirmed from `package.json` and CI.
