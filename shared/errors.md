# Shared Errors

- 2026-09-05 | TT-B001 TEST-1 | `FAIL` | Optional sync authorization read `deviceMetadata`
  inside narrower finance transactions, producing unhandled Dexie `NotFoundError` rejections.
  Repair 1 moves dispatch after commit and adds composition coverage.
- 2026-09-05 | TT-B001 RETEST-1 | `RESOLVED` | The exact production-composition reproduction
  saved one transaction with zero unhandled rejections; focused, full, and browser regressions pass.
- 2026-09-05 | TT-B001 CI-1 | `RESOLVED_LOCALLY` | Push and pull-request runs reached the Playwright
  step but could not start its server because the previous smoke step left port 3000 occupied.
  The browser server was isolated to port 3100, both origin checks derive the configured base URL,
  and both viewport projects pass locally; GitHub rerun pending.
