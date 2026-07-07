### Observation 001: Task observer workspace was not initialized at activation

**Status:** OPEN  
**Date:** 2026-04-30  
**Type:** skill-update  
**Scope:** skill  
**Target:** task-observer  
**Trigger:** The task-observer skill was activated for a substantive repo continuation task, but the observer workspace was only created after the user asked for observations.  
**Issue:** The skill's workspace initialization step can be missed during implementation-heavy work.  
**Suggested improvement:** Add a short preflight reminder or checklist item to the task-observer workflow: when activated, immediately check or create `.codex-observer/` before continuing the main task.  
**Evidence:** Repo mapping and scaffold continuation completed before `.codex-observer/log.md` existed.  
**Risk if ignored:** Future sessions may claim task-observer was active while leaving no durable observation trail for review.  
**Next action:** discuss with user

### Observation 002: Roadmap lists need a separate excluded-scope lane

**Status:** RESOLVED
**Date:** 2026-05-07
**Type:** agents-md
**Scope:** repo
**Target:** BLUEPRINT.md, AGENTS.md, docs/PROJECT_STATE.md, docs/REPO_MAP.md
**Trigger:** The user asked to remove bank imports and photo scanning from scope after QA surfaced them as possible later additions.
**Issue:** The blueprint mixed normal V1 non-goals with ideas that should not remain in the V1.5/V2 candidate roadmap.
**Suggested improvement:** Keep a dedicated out-of-product-scope list for ideas that should not be treated as future candidates unless explicitly re-scoped.
**Evidence:** `BLUEPRINT.md` previously listed bank import and receipt/photo attachments in Future Features while repo guidance only blocked bank imports in V1.
**Risk if ignored:** Future planning passes may keep reintroducing excluded features as "later" roadmap items.
**Next action:** keep resolved unless this pattern appears in other repos or skills

### Observation 003: QA plans should name authenticated browser prerequisites

**Status:** OPEN
**Date:** 2026-05-20
**Type:** agents-md
**Scope:** repo
**Target:** docs/PROJECT_STATE.md, docs/REPO_MAP.md
**Trigger:** The QA remediation plan required browser checks for authenticated TapTrack pages, but the local browser profile had no Supabase session.
**Issue:** Route smoke and DOM checks could verify public/login/PWA behavior, but authenticated workspace visual checks were blocked by credentials rather than product code.
**Suggested improvement:** Future QA plans should explicitly list whether an authenticated browser session, seeded local auth profile, or temporary test account is available before requiring visual checks for protected pages.
**Evidence:** `/app` correctly redirected to `/login`; login desktop/mobile DOM checks passed, but dashboard/transactions/reports/settings browser checks could not be reached without a real session.
**Risk if ignored:** QA reports may blur the difference between verified authenticated UI behavior and checks that were blocked by auth setup.
**Next action:** discuss with user
### Observation 004: Optional Dexie records need explicit null live-query results

**Status:** OPEN  
**Date:** 2026-07-07  
**Type:** agents-md  
**Scope:** repo  
**Target:** AGENTS.md  
**Trigger:** Budgets and Reports stayed on skeleton loading when the selected month had no monthly budget row.  
**Issue:** UI useLiveQuery calls used Dexie first() directly, so an absent optional record returned undefined, the same sentinel used for loading.  
**Suggested improvement:** Add repo guidance or a local helper pattern: optional live queries should coerce missing records to null and reserve undefined for loading.  
**Evidence:** BudgetsWorkspace and ReportsWorkspace monthlyBudget queries now return null when no record exists.  
**Risk if ignored:** Future optional IndexedDB reads may create infinite loading states for empty but valid app data.  
**Next action:** discuss with user

