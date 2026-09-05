# Shared Errors

- 2026-09-05 | TT-B001 TEST-1 | `FAIL` | Optional sync authorization read `deviceMetadata`
  inside narrower finance transactions, producing unhandled Dexie `NotFoundError` rejections.
  Repair 1 moves dispatch after commit and adds composition coverage.
- 2026-09-05 | TT-B001 RETEST-1 | `RESOLVED` | The exact production-composition reproduction
  saved one transaction with zero unhandled rejections; focused, full, and browser regressions pass.
