# Dependency Security Upgrade Record

Last updated: 2026-08-08

## Status

The previously deferred framework/dependency security batch is complete on the TapTrack upgrade/publication branches.

The application has been migrated from Next.js 14 / React 18 to:

- Next.js **16.2.12**
- React / React DOM **19.2.8**
- Node.js 20.9+ (CI: Node 22)
- ESLint **10.8.0** with the official `@eslint/compat` wrapper for the current Next plugin stack
- Vitest **4.1.10**

The upgrade also moved `middleware.ts` to the Next 16 `proxy.ts` convention and replaced `next lint` with the ESLint flat-config CLI flow.

## Security remediation

The first Next 16 dependency graph still exposed advisory findings through transitive packages. The maintained graph now pins/overrides patched dependency lines where needed, including current Vite, PostCSS, Sharp, and Nano ID versions.

The publication dependency refresh on 2026-08-08 produced:

```text
npm audit --audit-level=high
found 0 vulnerabilities
```

The production-only audit is also clean.

## Verification

The committed upgrade source has passed:

```text
npm ci
npm audit --omit=dev --audit-level=high
npm run lint
npm run typecheck
npm run test
npm run build
npm run smoke:routes
```

Results:

- lint: pass
- typecheck: pass
- Vitest: 14 files / 67 tests pass
- Next.js 16.2.12 production build: pass
- route/API smoke: 8/8 pass
- production dependency audit: 0 vulnerabilities

The publication branch additionally gates the **full** dependency tree with `npm audit --audit-level=high`.

## ESLint 10 compatibility note

`eslint-config-next@16.2.12` currently pulls React/import/a11y plugins whose peer ranges and rule APIs target ESLint 9. Rather than disabling lint rules or reverting to the older dependency graph, TapTrack wraps the imported Next configs with the official `@eslint/compat` `fixupConfigRules()` compatibility layer.

This is intentionally temporary infrastructure. Remove the wrapper when the upstream plugin stack natively supports ESLint 10 and the full verification/audit ladder remains green without it.

## Remaining release work

Framework security is no longer the blocker. Public visibility now depends on publication concerns rather than the Next upgrade itself:

- explicit source-code license selection;
- final Git-history/privacy review;
- synthetic screenshots/demo data;
- authenticated manual walkthrough with a disposable test account.
