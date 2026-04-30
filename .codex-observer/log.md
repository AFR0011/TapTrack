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
