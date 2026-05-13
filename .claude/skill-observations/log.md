# Skill Observation Log

Observations captured during task-oriented work. Each entry identifies a
potential skill improvement or new skill opportunity.

**Status key:** OPEN = not yet actioned | ACTIONED = skill updated/created |
DECLINED = user decided not to pursue

---

## 2026-05-07 — TapTrack UX tightening session

### Observation 1: Consistent card pattern is a double-edged sword

**Date:** 2026-05-07
**Session context:** UX tightening for TapTrack personal finance tracker — 8 changes applied (text search, confirm dialogs, category deletion, recurring edit, toasts, softer cards, micro-interactions, mobile nav)
**Skill:** open-source skill candidate — extract shared Card/Section component
**Type:** open-source
**Phase/Area:** Component architecture, design consistency

**Issue:** Every component across the codebase uses the exact same card wrapper: `rounded-lg border border-slate-200 bg-white p-4 shadow-sm`. This made bulk changes fast (the same pattern-change was applied across 12 locations in seconds), but it's also why the app looked "blocky" in the first place. The consistency is a maintenance win but a UX problem — new pages accidentally inherit the old style every time.

**Suggested improvement:** Extract the card pattern into a shared `Card` or `Section` component with variant props (e.g., `variant="standard" | "soft" | "compact"`). This would make it easy to switch between styles and prevent new pages from accidentally reintroducing the old aesthetic.

**Principle:** When a pattern is truly copy-pasted 12+ times, it's a component waiting to exist. The fix isn't always to extract immediately — but when the pattern is also the source of a systemic problem (visual uniformity that reads as "blocky"), extraction is the right lever to address both maintenance and design consistency at once.
