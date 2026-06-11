I've now read every route, all 15 components, the styling layer (app/globals.css, tailwind.config.ts), the theme system, and the product docs. I have everything needed for the audit. No code was changed.

UI/UX and Design Audit Report
1. Executive Summary
TapTrack is functionally solid and far better structured than most solo projects — the data layer is clean, states mostly exist, and there's a real ConfirmDialog with a focus trap. But visually, the app is two different apps stitched together: a flashy "fintech glass" design (gradients, glassmorphism, animated numbers) on Dashboard/Conversions/Login, and a plain "developer admin panel" design (flat white cards, uppercase micro-labels, raw <select> grids) on Transactions/Budgets/Recurring/Settings. Neither language is committed to, so the whole reads as inconsistent rather than designed.

The three most damaging problems, bluntly:

Dark mode is a CSS hack, not a theme. app/globals.css remaps light-mode utility classes with .dark .bg-white { ... } overrides. It covers maybe 40% of the classes actually used. In dark mode, every bg-blue-50, bg-emerald-50, bg-violet-50, bg-red-50, gradient (from-slate-50 to-slate-100), hover state (hover:bg-slate-100), the toaster, and the Recharts tooltips stay light. Dark mode ships broken.
Mobile users cannot sign out. The only sign-out button lives in the desktop-only header (hidden ... md:block in AppShell.tsx). On mobile there is no header at all.
Accessibility contrast failures across the board. text-slate-400 (≈2.8:1 on white) is used for nearly all metadata text, and SetupForm.tsx renders its error in text-red-300 on a white card — effectively invisible.
The good news: because almost all styling is inline Tailwind with repeated literal class strings, a focused token + primitive-component pass would fix most of this without touching any logic.

2. Product and Screen Map
What this app appears to be:   A local-first personal income/expense tracker (Dexie/IndexedDB)
                               with optional Supabase sync, Telegram capture, AI categorization.
Primary users:                 One person (the developer), mobile-first daily use per BLUEPRINT.md.
Primary user goals:            (1) Log a transaction in <5 seconds, (2) see today/month spend vs
                               budget, (3) monthly review/reports, (4) keep balances accurate.
Main screens:                  /login, Setup gate, /app (Dashboard), /app/transactions,
                               /app/conversions, /app/budgets, /app/recurring, /app/reports,
                               /app/settings.
Most important flows:          Quick command capture (CommandInput → preview → save);
                               glance at month status; transaction edit/delete; monthly report.
Current UI style:              Split personality: blue→violet gradient + glassmorphism on
                               Dashboard/Login/Conversions; flat slate admin UI everywhere else.
Current design maturity:       Mid. Real states, real dialogs, real animations — but no design
                               tokens, no shared primitives beyond AnimatedNumber, inconsistent
                               component styling, broken dark mode, contrast failures.
Route → component map (all routes are thin wrappers): app/(authenticated)/app/*/page.tsx → src/components/*Workspace.tsx. Shell: src/components/AppShell.tsx. The only shared UI primitives are ConfirmDialog, ToastProvider, and ui/AnimatedNumber — every workspace re-declares its own FormInput/FormSelect/Metric/EmptyState/ProgressBar.

3. Top UI/UX Problems
Problem 1 — Dark mode is structurally broken
Problem:   Dark theme implemented via global CSS class-overrides instead of Tailwind dark: variants.
Where:     app/globals.css lines 26–53; consumed by every component.
Evidence:  Overrides exist only for bg-white, bg-slate-50, bg-slate-100, 4 text classes, 3 border
           classes. Not covered: bg-blue-50 (ReportsWorkspace toggle, ConversionsWorkspace source
           highlight), bg-emerald-50 (login success, conversions destination), bg-violet-50
           (SettingsWorkspace AI note), bg-red-50 (login error), gradient stops
           from-slate-50/to-slate-100 (DashboardSummary balance tiles), hover:bg-slate-100/
           hover:bg-slate-50 (dozens of buttons/rows — hover variants don't match `.dark .bg-slate-100`),
           the hardcoded white Toaster (ToastProvider.tsx lines 13–17), Recharts tooltips,
           border-white/60, shadow-glass. Also all four slate text shades collapse to one gray
           (#94a3b8), erasing text hierarchy in dark mode.
Why it hurts: A user enables dark mode in Settings and gets a patchwork of light cards, white
           toasts, and invisible hovers. It signals "unfinished" more loudly than anything else.
Severity:  Critical (if dark mode is offered) — otherwise High.
Principle: Single source of truth for theme; tokens over overrides.
Fix:       Replace the override block with semantic CSS variables (--surface, --surface-raised,
           --text-primary, --text-secondary, --text-muted, --border, --accent…) defined for :root
           and .dark, exposed via tailwind.config.ts colors. Components then use bg-surface,
           text-secondary, etc. once — no dark: spam, no override hacks.
Implementation: ~10 variables in globals.css, ~8 entries in tailwind.config.ts, then a mechanical
           find/replace pass per component. Logic untouched.
Verify:    Toggle dark mode in Settings; walk all 7 screens; open a toast, a chart tooltip,
           a confirm dialog; nothing should remain light.
Problem 2 — No sign-out (or any header) on mobile
Problem:   The entire desktop header — brand, nav, Sign out — is hidden below md.
Where:     src/components/AppShell.tsx line 57 (`hidden ... md:block`).
Evidence:  Mobile bottom nav (lines 111–175) contains only nav links. No other sign-out exists.
Why it hurts: This is a mobile-first product per BLUEPRINT.md, and a core account action is
           unreachable on the primary form factor. Also: no brand presence on mobile at all.
Severity:  High.
Principle: Feature parity for core actions across breakpoints.
Fix:       Add an "Account" section to /app/settings (email + Sign out button) — Settings is the
           natural home for it and is reachable via the "More" menu. Optionally add a slim mobile
           top bar with just the wordmark.
Implementation: Move handleSignOut logic (AppShell lines 47–52) into a small shared helper or
           duplicate the 4 lines in SettingsWorkspace; add one card section.
Verify:    On a 390px viewport, sign out from Settings; confirm redirect to /login.
Problem 3 — Two competing visual languages
Problem:   Glass/gradient style vs flat admin style, used screen-by-screen with no logic.
Where:     Glass: DashboardSummary, RecentTransactions, ConversionsWorkspace ("border-white/60
           bg-white/90 shadow-glass backdrop-blur-sm"). Flat: TransactionsWorkspace,
           BudgetsWorkspace, ReportsWorkspace, SettingsWorkspace, SetupForm ("border-slate-200
           bg-white shadow-xs"). Primary buttons: flat blue-500 (TransactionsWorkspace line 120),
           gradient blue→violet (login, conversions submit, nav pills), emerald-600 for the most
           important Save in the app (CommandInput line 247).
Evidence:  Same "card" concept has at least 4 class recipes; same "primary button" concept has 3
           colors and 3 radii (rounded-md, rounded-lg, rounded-xl).
Why it hurts: Visual noise reads as accidental, not styled. The emerald Save vs blue Preview
           also inverts the expected hierarchy — the most important commit action in the app
           changes color family mid-flow.
Severity:  High (this is what makes it "look amateur" most directly).
Principle: Consistency; one component = one appearance.
Fix:       Pick ONE language (recommendation in §5), encode it in a Card and Button primitive,
           and delete the other recipe everywhere. Primary = one solid accent. Use color only
           for meaning (emerald = income/positive, red = expense/danger), never for button rank.
Implementation: Create src/components/ui/Card.tsx and Button.tsx (variant: primary/secondary/
           ghost/danger), then replace class strings per workspace.
Verify:    Grep for "shadow-glass" and "from-blue-600 to-violet-600" — should only appear inside
           the primitives (or nowhere).
Problem 4 — Contrast failures (confirmed, measurable)
Problem:   Sub-AA text contrast in metadata, placeholders, and one error message.
Where:     text-slate-400 on white: RecentTransactions meta rows (line 101), Conversions history
           dates, balance tile labels (DashboardSummary line 103), Settings footnotes, "revert"
           button in CommandInput (line 227). text-red-300 error: SetupForm.tsx line 121.
Evidence:  slate-400 (#94a3b8) on white ≈ 2.8:1 — fails WCAG AA (4.5:1) for body-size text.
           red-300 (#fca5a5) on white ≈ 1.9:1 — illegible; clearly a leftover from a dark layout.
Why it hurts: Dates, categories, and methods ARE the content in a finance app, not decoration.
           And a failed setup currently shows an error the user may literally not see.
Severity:  High (red-300 bug: Critical for the setup flow).
Principle: WCAG 1.4.3.
Fix:       Map metadata to slate-500 minimum (#64748b ≈ 4.6:1) and define it once as text-muted.
           SetupForm error → text-red-600 in the same bordered red-50 pattern used by login
           (app/(auth)/login/page.tsx lines 121–125).
Verify:    Browser devtools contrast checker on transaction meta rows; trigger a setup error.
Problem 5 — The hero action doesn't look like the hero
Problem:   Quick command capture — the product's entire reason to exist — is a visually ordinary
           card with a cryptic placeholder and no syntax help.
Where:     src/components/CommandInput.tsx; dashboard composition in app/(authenticated)/app/page.tsx.
Evidence:  The card uses the same border/padding/title treatment as every other card. Syntax
           guidance is one line of examples ("-120 coffee cash, +20000 salary card…"). Errors are
           a single red line that can become a wall of text for multi-entry failures (line 67).
           On save, the input silently clears — no success toast, unlike Transactions which toasts
           on every CRUD action.
Why it hurts: BLUEPRINT.md: "Normal transaction logging should take under 5 seconds." The UI gives
           this flow no visual priority, no learnability, and weak completion feedback. New-user
           question: "what do I type?" Post-save question: "did that work?"
Severity:  High.
Principle: Visual hierarchy must match task hierarchy; visibility of system status.
Fix:       (a) Make it the visually dominant element: larger input (text-base, h-12+), focused by
           default on desktop, distinct accent ring. (b) Add a collapsible one-line syntax hint
           ("[-|+]amount title [cash|card] [date]") or 2–3 tappable example chips that fill the
           input. (c) Toast on save: "Saved 3 transactions · -870 ₺" (toast is already wired
           app-wide via sonner). (d) Render multi-entry errors as a list, one line per entry,
           not a joined sentence.
Implementation: All inside CommandInput.tsx; ~40 lines. No data-flow changes.
Verify:    Type garbage in 3 entries → see 3 readable error lines; save 2 entries → see toast;
           dashboard loads with the command card unmistakably first in visual weight.
Problem 6 — Placeholder-as-value editing pattern (Budgets, Balances)
Problem:   Current values shown as input *placeholders*; empty input + Save silently writes the
           placeholder value back.
Where:     BudgetsWorkspace.tsx lines 90–104 (monthly total: `placeholder={String(monthlyBudget?.
           totalBudget ?? 0)}`, save falls back to placeholder at line 49) and CategoryBudgetRow
           lines 184–201; SettingsWorkspace BalanceRow lines 440–453 ("New amount" + Save).
Evidence:  Code paths above; the input also clears after save, so the field always looks empty
           even when a budget is set.
Why it hurts: Users can't tell set-vs-unset budgets apart, can't see what they're editing, and
           pressing Save with an empty field "does something" invisible. Classic "did that work?"
           moment — there's also no success toast on budget save.
Severity:  Medium-High.
Principle: Visibility of system status; recognition over recall.
Fix:       Controlled inputs initialized to the current value (value={input ?? String(budget)}),
           Save disabled until the value differs, success toast on save. For balances, show the
           current amount inside the input, not beside it.
Implementation: Local state changes only in those two files.
Verify:    Open Budgets → fields show current numbers; Save disabled until edited; toast on save.
Problem 7 — No loading design: zero-flash + count-up-from-0 on every visit
Problem:   All useLiveQuery hooks default to [] / undefined, so every screen renders "empty/0"
           for a frame, then pops to real data; AnimatedNumber then counts up from 0 on every
           mount (ui/AnimatedNumber.tsx lines 23–27 — prevValueRef starts at 0).
Where:     DashboardSummary, RecentTransactions, all workspaces; aggravated by the AnimatePresence
           route transition remounting pages (AppShell lines 96–108).
Evidence:  `useLiveQuery(() => db.transactions.toArray(), [], [])` patterns; no skeleton exists
           anywhere except the SetupGate's plain-text "Preparing local ledger...".
Why it hurts: Numbers visibly lying (0 → 4,200) for half a second on every navigation makes a
           finance app feel untrustworthy; it also re-triggers on every tab switch, which turns a
           "delight" animation into a tic.
Severity:  Medium.
Principle: Skeletons over spinners over flashes; animate on data change, not on mount.
Fix:       (a) Distinguish undefined (loading) from [] (truly empty) — useLiveQuery without a
           default returns undefined while loading; render 2–3 shimmer rows / a skeleton card
           (the `shimmer` keyframe already exists in tailwind.config.ts, unused). (b) In
           AnimatedNumber, render the final value immediately on first mount and only animate
           subsequent changes.
Verify:    Hard-reload /app on throttled CPU: skeletons, then data, no 0-flash; switch tabs
           back and forth: numbers do not re-count.
Problem 8 — Mobile "More" menu: stuck-open <details>, buried Reports/Settings
Problem:   The bottom-nav overflow menu is a native <details> that does not close on navigation
           or outside tap, and it hides Reports + Settings behind an extra tap.
Where:     AppShell.tsx lines 136–173.
Evidence:  No onClick handler closes the <details>; the nav lives outside the route transition,
           so after tapping "Reports" the dropdown remains open over the new page. The summary's
           chevron is wrapped in motion.svg but rotates via CSS class anyway (motion unused).
           Also: 6th column is 3rem wide vs flexible siblings, so "More" is visually cramped.
Why it hurts: A menu that stays open after use feels broken. And monthly review (Reports) is a
           top-3 user goal per the blueprint but is two taps deep.
Severity:  Medium.
Principle: Closure of interaction loops; frequency-based nav ordering.
Fix:       Short term: close on click (onClick on each Link: e.currentTarget.closest('details')
           ?.removeAttribute('open')) + close on route change. Better: reduce to 5 tabs total —
           Home, History, Transfers, Reports, Settings — and move Budgets/Recurring INTO pages
           (Budgets as a tab inside Reports or a card on Home; Recurring inside Transactions).
           Five primary destinations is the practical ceiling for bottom nav anyway.
Verify:    Tap More → Reports: menu closed on arrival. All destinations reachable in ≤2 taps.
Problem 9 — Sub-44px touch targets and missing focus-visible states
Problem:   Most buttons are px-3/4 py-2 text-sm (~36px tall); tiny text-xs links ("Edit",
           "Delete", "revert") are ~24px; almost no button has a visible keyboard focus style.
Where:     Edit/Delete row actions (TransactionsWorkspace lines 224–229, SettingsWorkspace
           category list lines 376–383), CommandInput "revert" (line 227), every button without
           focus-visible: classes (all except the two toggle switches in SettingsWorkspace,
           which correctly use focus:ring).
Evidence:  Only CommandInput and Conversions use min-h-11; nothing else does. Grep for
           "focus-visible" returns nothing.
Why it hurts: Mobile-first app with fiddly mobile targets; keyboard users cannot see where they
           are (inputs at least change border color; buttons give nothing).
Severity:  Medium (a11y: High).
Principle: WCAG 2.5.8 target size; 2.4.7 focus visible.
Fix:       In the Button primitive (Problem 3): min-h-11 on mobile sizes + a global
           `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600`.
           Convert text-xs action links in list rows to icon buttons with p-2.5 hit areas or
           a row-level overflow menu.
Verify:    Tab through Dashboard and Transactions — every interactive element shows a ring;
           devtools mobile emulation: no target under 44×44.
Problem 10 — Developer vocabulary leaking into the UI
Problem:   Labels and feedback written for the implementer, not the user.
Where:     "Run due check" + "Created 2, skipped 0, failed 0." (RecurringWorkspace lines 182,
           164); "Last-used method fallback" (SettingsWorkspace line 247); "Local-first finance
           console" (AppShell line 63); "Preparing local ledger..." (SetupGate line 15);
           uppercase micro-labels on every input ("TYPE", "METHOD") via the repeated
           `uppercase tracking-normal` label recipe; sync metrics "Last pull / Last push /
           Pending retries".
Evidence:  Lines cited.
Why it hurts: Each one is a small "this is a dev tool" signal; together they define the tone.
Severity:  Medium (cheap to fix, high perceived-quality return).
Fix:       "Run due check" → "Process due items"; result → "Added 2 scheduled transactions."
           (hide skipped/failed unless nonzero). "Last-used method fallback" → "Default payment
           method". Tagline → "Personal finance tracker" (login already says this). Sentence-case
           all field labels (drop the uppercase recipe in the future Field primitive). Sync panel
           → one status line ("Synced 2 min ago · 0 pending") with details behind it.
Verify:    Read every visible string on each screen; no jargon, consistent casing.
Honorable mentions (confirmed, lower severity): Reports pie chart has no legend or labels — category names only on hover, useless on touch (ReportsWorkspace.tsx lines 281–290); Y-axes show raw numbers without ₺ formatting; non-interactive cards use hover:shadow-md, falsely implying clickability (everywhere the flat card recipe appears); TransactionForm isn't a <form> so Enter doesn't submit; toasts are top-right which collides with thumb-zone usage on mobile (bottom-center is better there); recurring delete has no ConfirmDialog while transaction delete does (inconsistent destructive-action policy, RecurringWorkspace.tsx line 241).

4. Design Direction Options
Direction Name: Calm Personal Ledger (Mobile-First Daily Sheet)
Core idea:      One quiet, flat, high-contrast visual language built around the daily loop:
                capture → glance at budget → recent items. Looks like a tool you trust with
                money: solid surfaces, one blue accent, semantic green/red only for amounts.
Best for:       The actual blueprint user: one person logging on a phone every day.
Visual style:   Flat white/near-black surfaces, 1px borders, shadow only on overlays. Kill
                glassmorphism, gradients, and backdrop-blur. Inter stays; tabular-nums
                everywhere money appears.
Layout:         max-w-2xl single column on Dashboard (capture card dominant, budget bar,
                recent list); wider layouts only on Reports. Bottom nav reduced to 5 real tabs.
Navigation:     Mobile: 5-tab bottom nav (Home, History, Transfers, Reports, Settings);
                Budgets merges into Home/Reports, Recurring merges into History as a tab.
                Desktop: same top header, simplified to solid-accent active state.
Component changes: New ui/ primitives (Button, Card, Field, EmptyState, Skeleton, StatRow);
                semantic color tokens; placeholder-editing pattern replaced.
Pros:           Matches product DNA; least visual risk; fixes dark mode cheaply via tokens;
                smallest class-churn since the flat style already exists on 5 of 8 screens.
Cons:           Less "impressive" at first glance; deletes work already done on glass styling.
Risks:          Low — purely presentational.
Implementation difficulty: Medium.
Best first screen to redesign: Dashboard (/app).
Direction Name: Command Console (Linear-style)
Core idea:      Lean into the command-first identity: global command bar (⌘K / always-visible),
                dense keyboard-friendly lists, terse dark-first aesthetic.
Best for:       Power users at a desktop; the developer themself.
Visual style:   Dark-first, 13–14px dense type, monospace amounts, subtle borders, no cards —
                full-width list rows with column alignment.
Layout:         Persistent left sidebar on desktop, command bar pinned top; mobile keeps bottom nav.
Navigation:     Sidebar + command palette (parser already exists — palette could accept the same
                syntax anywhere in the app).
Component changes: New CommandBar overlay, list-row system, kbd hints; major restyling of all lists.
Pros:           Strong identity; the parser is genuinely the app's best feature and this showcases it.
Cons:           Fights the mobile-first goal; dense UI is worse for thumb capture; biggest rework.
Risks:          Medium-High — restyles every list and the shell.
Implementation difficulty: High.
Best first screen to redesign: App shell + global command bar.
Direction Name: Fintech Glass, Finished Properly
Core idea:      Keep the existing gradient/glass identity but apply it EVERYWHERE with discipline:
                one gradient (brand only), glass only on elevated summary cards, flat for forms.
Best for:       Maximum visual wow with minimal identity change.
Visual style:   Current blue→violet brand, glass summary cards, flat input surfaces, large
                rounded geometry (rounded-2xl standard).
Layout:         Keep current layouts; promote the Month Status card to a full-width hero with
                the command input embedded in it.
Navigation:     Keep gradient pill nav; fix the More menu.
Component changes: Same primitive set as Direction 1 but with glass Card variant; gradient
                reserved for brand + primary CTA only.
Pros:           Preserves invested styling; demo-friendly.
Cons:           Glass + blur is the hardest style to keep consistent and performant; dark-mode
                glass is genuinely difficult; gradients on small UI elements age poorly.
Risks:          Medium — high chance of re-creating today's inconsistency in a year.
Implementation difficulty: Medium-High.
Best first screen to redesign: Dashboard.
Direction Name: Dense Admin Console
Core idea:      Embrace the admin-panel DNA: real tables, column sorting, bulk actions, filters
                in a toolbar row.
Best for:       Heavy retroactive editing of hundreds of rows on desktop.
Visual style:   Compact, table-first, minimal chrome.
Layout:         Full-width tables, sticky headers, side filter rail.
Navigation:     Top tabs.
Pros:           Great for History/Reports power editing.
Cons:           Directly contradicts the mobile-first 5-second-capture mission; tables are
                miserable at 390px.
Risks:          High product-fit risk.
Implementation difficulty: Medium.
Best first screen to redesign: Transactions.
5. Recommended Direction
Calm Personal Ledger. Opinionated reasoning:

It fits the product. BLUEPRINT.md is explicit: mobile-first, one user, logging speed over everything. A calm, flat, high-contrast UI optimizes for glanceability and thumb capture. Glass blur and gradient pills optimize for screenshots.
It fits the codebase. Five of eight screens already use the flat card recipe; the glass recipe exists on only three. Choosing flat means the smaller migration. The token work (CSS variables + Tailwind colors) simultaneously fixes the broken dark mode — one effort, two wins. Framer Motion stays for the things it does well (layout pills, list enter/exit) and gets removed where it's noise (count-up-from-zero, page fade on every nav).
It fits user behavior. Daily use means the UI is seen hundreds of times; novelty effects (gradients, glass, number count-ups) depreciate to zero in a week, while contrast, target size, and speed compound.
Why not the alternatives: Command Console is the most interesting direction and worth stealing one idea from (the parser as a globally accessible capture bar later), but it's desktop-DNA and triples the scope. Fintech Glass means betting on the hardest-to-maintain style for a developer who self-identifies as weak at design — flat systems are far more forgiving. Dense Admin contradicts the mission.
Accepted tradeoffs: The app becomes visually quieter; the existing gradient/glass work on Dashboard/Conversions/Login is mostly discarded; "wow" is traded for "trust."
6. Screen-by-Screen Redesign Plan
Screen:  Dashboard (/app)
Current issue: Hero capture card has no visual priority; redundant header tagline; 0-flash
         numbers; balances tile labels at 2.8:1 contrast; glass/flat mix.
Target UX: Open app → cursor/eyes land on capture → glance month bar → scan recent. 3 seconds.
Layout changes: max-w-2xl single column (currently max-w-7xl with a 1.3fr/0.7fr split that
         spreads thin content wide on desktop). Order: capture card (dominant), month status
         (spend + remaining + bar in ONE compact card), balances as a horizontal chip row
         (not a 2-col grid of tinted tiles), recent list.
Component changes: CommandInput gets text-base h-12 input, autofocus on desktop, example chips,
         save toast, list-style multi-errors. DashboardSummary loses glass + gradient bar
         (solid accent bar; red only when over budget). Balances chips: plain border, currency
         symbol prominent, slate-500 labels.
Content/hierarchy changes: Delete the header paragraph "Command-first logging with live…"
         (app/(authenticated)/app/page.tsx lines 24–26) — it explains the UI instead of being
         the UI. Month name moves into the Month status card title.
Mobile changes: Capture card sticky-ish at top works naturally in single column; ensure
         keyboard-open viewport doesn't hide the preview (preview renders below input — fine).
States to add: Skeleton card + 3 shimmer rows while Dexie loads; richer empty state for
         brand-new users ("No transactions yet — try '-120 coffee cash'") with a tap-to-fill chip.
Files likely involved: app/(authenticated)/app/page.tsx, src/components/CommandInput.tsx,
         DashboardSummary.tsx, RecentTransactions.tsx, ui/AnimatedNumber.tsx.
Risk level: Low.
Screen:  Transactions (/app/transactions)
Current issue: 5 stacked filter fields consume the first screenful on mobile before any data;
         row actions are two text buttons per row (visual noise × N rows); add-form toggles
         above filters and pushes everything; uppercase label recipe everywhere.
Target UX: List first. Filters one row (search + month visible; type/method/category collapse
         behind a "Filters" toggle on mobile). Add = primary button → form (later: drawer).
Layout changes: Filter card → single toolbar row, collapsible advanced filters on <md.
         Group list rows by date with sticky date subheaders (data is already date-sorted).
Component changes: Use shared Field primitive (kills local FormInput/FormSelect); row actions
         become an icon-only edit pencil + overflow, or whole-row tap → edit. Amount column
         right-aligned tabular-nums (already partially done in RecentTransactions, not here).
Content/hierarchy changes: Meta line "date / category / method" → category chip with its color
         dot (RecentTransactions already does this; Transactions doesn't — inconsistent).
Mobile changes: Filters collapsed by default; Add button full-width or floating.
States to add: Loading skeleton; "no results for filters" vs "no transactions this month"
         distinguished (currently one message covers both); error toast already exists.
Files likely involved: src/components/TransactionsWorkspace.tsx, new ui/Field.tsx, ui/Button.tsx.
Risk level: Low-Medium (biggest file churn, zero logic change).
Screen:  Budgets (/app/budgets)
Current issue: Placeholder-as-value editing (Problem 6); progress bars flat blue regardless of
         danger; no success feedback; metric rows duplicated style with Reports.
Target UX: See month health instantly; edit a budget in place with the current value visible.
Layout changes: Keep 2-col desktop split; on mobile, Monthly total card first.
Component changes: Controlled inputs prefilled with current values + dirty-state Save;
         ProgressBar gains thresholds (accent → amber ≥80% → red ≥100%); shared StatRow.
Content/hierarchy changes: "Available/Spent/Remaining/Rollover" — Remaining is the answer users
         want; make it the largest number, demote Rollover to caption.
Mobile changes: Category rows: name+bar on one line, input+save on next; ensure 44px targets.
States to add: Success toast on save; loading skeleton.
Files likely involved: src/components/BudgetsWorkspace.tsx, ui/ProgressBar.tsx (new, also used
         by DashboardSummary and ReportsWorkspace).
Risk level: Low.
Screen:  Reports (/app/reports)
Current issue: Pie has no legend (touch users never see category names); axis numbers
         unformatted; "Unify to TRY" toggle looks like a button not a toggle; budget panel
         shows a chart-less wall when mode ≠ month.
Target UX: Pick period → read three numbers → scan two charts → export.
Layout changes: Keep. Move the three Metric cards above the controls card on mobile (answer
         before configuration).
Component changes: Replace pie with a horizontal bar list (category name + colored bar +
         amount + %) — better for 6+ categories, needs no tooltip, accessible. Format Y-axes
         with compact ₺ ("12k ₺"). "Unify to TRY" → a labeled switch (reuse the Settings toggle
         pattern) with the rate caption beneath.
Content/hierarchy changes: Month-only budget panel: when mode ≠ month show a one-line note,
         not a full empty-state block.
Mobile changes: Charts height 220 on <sm; ensure horizontal bar list replaces pie on touch.
States to add: ratesLoading already handled; add chart skeletons.
Files likely involved: src/components/ReportsWorkspace.tsx.
Risk level: Medium (chart swap is the most visual change; Recharts BarChart layout="vertical"
         or a plain div-based bar list both work — recommend the div list, simpler and themable).
Screen:  Settings (/app/settings)
Current issue: 6 dense cards in one scroll; balance editing UX (Problem 6); category manager's
         5-column grid collapses awkwardly on mobile; sync panel is 5 metric boxes of jargon;
         no account section.
Target UX: Grouped, scannable settings; account actions present.
Layout changes: Group into titled sections: Account (NEW: email + sign out), Preferences
         (default method, dark mode, AI), Money (balances), Categories, Data (sync, export/
         import/reset). Single column max-w-2xl — settings don't benefit from 2-col.
Component changes: Balance rows → prefilled controlled inputs; category add form → stacked
         rows on mobile; sync panel → one status sentence + "Sync now" + expandable detail.
Content/hierarchy changes: Rename jargon (Problem 10). "Reset data" gets separated into a
         visually distinct danger zone at the bottom, not mixed into the export button row.
Mobile changes: All grids → single column; color input gets a fixed 44px swatch.
States to add: Sync error surface (currently only toast); import success already toasts.
Files likely involved: src/components/SettingsWorkspace.tsx, AppShell.tsx (sign-out helper).
Risk level: Low-Medium (largest file, but additive restructuring).
Screen:  Conversions, Recurring, Login, Setup
Conversions: Best-designed screen today (from/to fieldsets, highlighted source/destination
         balances, implied rate). Keep the structure; just migrate glass→flat tokens, swap the
         text "↓" arrow for a real icon, and gradient submit → primary button. Risk: Low.
Recurring: Apply shared Field primitives; add ConfirmDialog to delete (parity with
         transactions); humanize due-check copy; "Pause/Resume" → switch or clear status badge
         showing Active/Paused per row (state is currently invisible in the list). Risk: Low.
Login:   Already decent. Fix gradient button → primary token; keep tab switcher. Risk: Low.
Setup:   Fix text-red-300 bug immediately; reduce the 3-currency × 2-method grid to TRY-first
         with "Add USD/EUR balances" disclosure (most users start with one currency); make it
         feel like a welcome ("Welcome to TapTrack") not a config form. Risk: Low.
7. Component-Level Plan
Component: App shell / navigation
Current problem: Desktop header hidden on mobile (no brand, no sign-out); 7 destinations forced
        into 5+More; stuck-open details menu; route-change fade animation on every nav adds
        latency feel and remounts pages (re-triggering count-ups).
Recommended design: 5-tab bottom nav (Home, History, Transfers, Reports, Settings); More menu
        deleted; sign out in Settings; drop AnimatePresence page transitions (keep the nav
        pill layoutId animation — it's good).
Implementation notes: AppShell.tsx; merging Budgets/Recurring into other screens can be Phase 2 —
        short-term just fix the details-close bug.
Reusable? Yes (already is).
Component: Button
Current problem: 3 primary colors, 3 radii, inconsistent heights, no focus-visible, ad-hoc
        disabled styles. ~40 literal button class strings.
Recommended design: ui/Button.tsx — variants: primary (solid blue-600), secondary (border +
        surface), ghost, danger (red-600 solid for confirms, red text-ghost for row actions);
        sizes sm (h-9, desktop-dense) / md (h-11, default); rounded-lg everywhere;
        focus-visible ring built in; loading prop renders spinner + disables.
Implementation notes: Pure className composition, no library. Migrate file-by-file.
Reusable? Yes — the single highest-leverage component.
Component: Card
Current problem: 4 recipes (flat shadow-xs, glass, login's p-8 variant, setup's rounded-lg);
        non-interactive cards have hover shadows.
Recommended design: ui/Card.tsx — one recipe: bg-surface border border-default rounded-xl p-5
        (p-4 on mobile); no hover effects unless the card is a link; optional header slot
        (title + description + action) to standardize the "h2 + caption + right action"
        pattern that every workspace hand-rolls.
Reusable? Yes.
Component: Field (Input/Select wrapper)
Current problem: FormInput/FormSelect duplicated in TransactionsWorkspace and RecurringWorkspace,
        plus ~20 inline copies; uppercase label recipe; inconsistent rounded-md vs rounded-lg;
        focus style is border-only (no ring) in half the app.
Recommended design: ui/Field.tsx — sentence-case text-sm font-medium label, input h-11
        rounded-lg border-default focus ring, error slot under the field, supports
        input/select/native date/month. Built-in id/htmlFor wiring.
Reusable? Yes.
Component: EmptyState
Current problem: 4 hand-rolled variants (RecentTransactions, TransactionsWorkspace,
        RecurringWorkspace, ReportsWorkspace's local EmptyState) — same idea, different padding
        and copy patterns; all text-only.
Recommended design: ui/EmptyState.tsx — small icon, one-line title, one-line hint, optional
        action button. Distinguish "no data yet" (onboarding tone + CTA) from "no results"
        (clear-filters action).
Reusable? Yes.
Component: Skeleton / loading
Current problem: None exist; undefined-vs-empty not distinguished anywhere.
Recommended design: ui/Skeleton.tsx using the existing-but-unused `shimmer` animation from
        tailwind.config.ts; SkeletonRow and SkeletonCard presets.
Reusable? Yes.
Component: ProgressBar
Current problem: Two implementations (BudgetsWorkspace local, DashboardSummary inline motion
        version, ReportsWorkspace inline) with different danger logic.
Recommended design: ui/ProgressBar.tsx — accent <80%, amber 80–99%, red ≥100%; compact and
        regular sizes; optional animated fill (motion stays here, it's earned).
Reusable? Yes.
Component: ConfirmDialog
Current problem: Actually good (focus trap, ESC, aria). Minor: not used by recurring delete;
        backdrop has no fade; bg-white not tokenized.
Recommended design: Keep. Tokenize colors, adopt Button primitives, use everywhere destructive.
Reusable? Yes (already is).
Component: Toasts
Current problem: Hardcoded light style breaks dark mode; top-right is wrong for mobile thumbs;
        usage inconsistent (CRUD toasts on Transactions, silence on CommandInput save and
        budget saves).
Recommended design: position bottom-center on mobile (sonner supports responsive via
        position prop + CSS, or just use bottom-center globally); richColors or tokenized
        style; policy: every successful write toasts once, every failed write toasts the error.
Reusable? Yes (provider-level).
Component: Page header
Current problem: Each workspace hand-rolls h1 + caption + right-action; captions are filler
        ("Filter, search, add, edit, delete, and backdate local records." is a feature list,
        not help).
Recommended design: ui/PageHeader.tsx — title + optional ONE-line purpose caption + action slot.
        Cut captions that merely enumerate features.
Reusable? Yes.
Component: Mobile bottom navigation
Current problem: See shell. Also active gradient pill = brand-decoration on a wayfinding element.
Recommended design: 5 equal tabs, active = accent icon + label + small dot or soft accent-50
        background (flat), min 48px tall, keep layoutId spring (subtle, fast).
Reusable? Part of AppShell.
8. Visual System Plan
Realistic for the current stack (Tailwind + CSS variables, no new packages).

Typography (Inter, already loaded)
Page title: text-2xl font-semibold (keep) — only one per page.
Card/section title: text-base font-semibold (keep).
Body / list primary: text-sm font-medium.
Metadata / captions: text-sm or text-xs font-medium, color text-muted (≥ slate-500) — never slate-400 for meaning-bearing text.
Field labels: text-sm font-medium text-secondary, sentence case — retire the text-xs uppercase tracking-* recipe (it's currently the loudest "developer UI" signal and used ~30 times).
Money: always tabular-nums; hero number text-3xl font-bold; list amounts text-sm font-semibold.
Weights: 400 body rarely, 500 default, 600 emphasis, 700 hero numbers only. (Today nearly everything is 500–700, so nothing reads as emphasized.)
Spacing
Scale: stick to 4/8/12/16/20/24 (gap-1..6); the app already does this fairly well — codify it.
Page padding: px-4 mobile / px-6 desktop; content max-w-2xl for single-column pages (Dashboard, Settings), max-w-5xl for Reports/Transactions. Today's universal max-w-7xl makes thin content float in space on desktop.
Card padding: p-4 mobile, p-5 desktop (already common — make it the only option).
Section gap: space-y-5 mobile, space-y-6 desktop.
Mobile bottom padding: keep pb-24-ish clearance for the nav; current pb-36 is excessive.
Color (as CSS variables in globals.css, mapped in tailwind.config.ts)
Token	Light	Dark
--bg (app)
#f8fafc
#0b1220
--surface (cards)
#ffffff
#111a2c
--surface-2 (insets, rows)
#f1f5f9
#1a2334
--border
#e2e8f0
#283349
--text-primary
#0f172a
#f1f5f9
--text-secondary
#475569
#b6c2d4
--text-muted
#64748b
#8a98ad
--accent
#2563eb
#3b82f6
--success / income
#059669
#34d399
--danger / expense
#dc2626
#f87171
--warning
#d97706
#fbbf24
Dark mode note: with these tokens, delete the entire .dark .bg-white {...} override block — that's the fix, not an addition. Also pass token-based colors into Recharts (stroke/fill from a small chartColors helper) and the Toaster.

Components
Button variants: primary / secondary / ghost / danger (see §7). Gradient: nowhere, or wordmark only.
Card variants: default; inset (the bg-slate-50 metric-row look → bg-surface-2). No glass variant.
Input variants: default; error (red border + message). One radius: rounded-lg.
Badge/status: income (success-50/700), expense (danger-50/700), neutral (surface-2/secondary), AI (keep violet — it's a fine "smart feature" color if used only there).
Motion
Keep: nav pill layoutId spring; preview card expand in CommandInput; list item enter/exit in RecentTransactions/Conversions (cap stagger at 10 items, already done); ProgressBar fill on data change.
Remove: page-level AnimatePresence route fades (AppShell lines 96–108) — they add perceived latency and cause the remount/count-up problem; per-card mount fades on Dashboard (cards should just be there); AnimatedNumber count-up on first mount (animate only on change).
Durations: 150–200ms UI transitions, 300ms max for layout moves; respect prefers-reduced-motion via a single useReducedMotion check in the few remaining motion components.
9. Implementation Options
Plan A: Fast Polish (1–2 sessions)
No restructuring; highest perceived-quality-per-line.

Fix text-red-300 → text-red-600 bordered error (SetupForm.tsx line 121).
Global metadata contrast: text-slate-400 → text-slate-500 where text carries meaning (RecentTransactions, Conversions history, Settings footnotes, balance tile labels).
Add Sign out to Settings (mobile gap).
Close the More menu on navigation (AppShell.tsx details handler).
CommandInput: success toast, multi-error list rendering, text-base input, autofocus on desktop.
Toaster: position="bottom-center", tokenless dark-aware style (or theme prop synced with dark mode).
Add focus-visible ring classes to the ~10 most-used button recipes; min-h-11 on row-action buttons.
Unify primary buttons to solid bg-blue-600 (kill emerald Save and gradient submits).
Remove hover:shadow-md from non-interactive cards.
Files: SetupForm.tsx, SettingsWorkspace.tsx, AppShell.tsx, CommandInput.tsx, ToastProvider.tsx, RecentTransactions.tsx, ConversionsWorkspace.tsx, login page.
Difficulty: Low. Risk: Very low (class strings + one details handler).
Verify: npm.cmd run check; manual pass on mobile viewport; tab-through Dashboard.
Plan B: Focused Redesign — Dashboard + capture flow
Target: /app per §6 (single column, dominant capture card, compact month status, chip balances, skeletons, no-mount-animation numbers).
Component changes: CommandInput, DashboardSummary, RecentTransactions, ui/AnimatedNumber, first versions of ui/Card, ui/Button, ui/Skeleton, ui/ProgressBar (used only here for now).
State changes: undefined-vs-empty handling in the three dashboard queries; first-run empty state with example chip.
Files: the five components above + app/(authenticated)/app/page.tsx.
Risk: Low-Medium (the primitives must be designed once, carefully — everything later reuses them).
Verify: npm.cmd run check; throttled reload shows skeletons; save flow end-to-end with toast; 390px viewport pass.
Plan C: Design System Cleanup
Tokens: §8 CSS variables + Tailwind mapping; delete the .dark override block; tokenize Toaster, ConfirmDialog, chart colors.
Primitives: Button, Card, Field, EmptyState, Skeleton, ProgressBar, PageHeader under src/components/ui/.
Consolidation: delete duplicated FormInput/FormSelect/Input/Select in TransactionsWorkspace.tsx and RecurringWorkspace.tsx; delete local EmptyState/MetricRow/BudgetMetric clones; one downloadBlob helper (currently duplicated in ReportsWorkspace.tsx and SettingsWorkspace.tsx).
Migration strategy: tokens first (visual no-op in light mode), then migrate one workspace per commit: Transactions → Budgets → Recurring → Settings → Reports → Conversions → Login/Setup. Each commit passes npm.cmd run check.
Risk: Medium (large diff surface, zero logic risk if discipline holds: className-only changes).
Verify: per-commit check ladder; dark-mode walkthrough of all screens after token commit; grep gates (shadow-glass, slate-400, uppercase tracking should trend to zero outside ui/).
10. Recommended Patch Plan
Recommended sequencing = Plan A immediately, then C-foundation, then B, then remaining screens. Phased:

Phase 1: Foundation
- Change: Plan A quick fixes + color tokens in globals.css/tailwind.config.ts + delete the
  .dark override block + tokenize Toaster/ConfirmDialog. Build Button, Card, Field, EmptyState,
  Skeleton, ProgressBar, PageHeader primitives (used nowhere yet except where Plan A touched).
- Files: app/globals.css, tailwind.config.ts, src/components/ui/* (new), ToastProvider.tsx,
  ConfirmDialog.tsx, SetupForm.tsx, AppShell.tsx, SettingsWorkspace.tsx (sign out only).
- Why: Everything later depends on tokens + primitives; the dark-mode fix and contrast fix are
  the highest-severity confirmed bugs.
- Risk: Low — light mode is visually near-identical; dark mode changes a lot (it was broken).
- Verification: npm.cmd run check; dark-mode walkthrough; login + setup error states.
Phase 2: Main Screen Redesign (Dashboard)
- Change: Plan B in full, on top of the primitives.
- Files: app/(authenticated)/app/page.tsx, CommandInput.tsx, DashboardSummary.tsx,
  RecentTransactions.tsx, ui/AnimatedNumber.tsx.
- Why: It's the screen used daily and the home of the core flow.
- Risk: Low-Medium.
- Verification: capture flow end-to-end (single + multi-entry + parse failure + insufficient
  balance), skeleton-on-reload, no count-up on tab return, 390px pass.
Phase 3: Interaction States (Transactions, Budgets, Recurring)
- Change: Migrate the three CRUD screens to primitives; fix placeholder-as-value editing
  (controlled prefilled inputs + dirty-save + toasts); add recurring delete confirm; collapse
  mobile filters; icon row actions with 44px targets; date-grouped transaction list.
- Files: TransactionsWorkspace.tsx, BudgetsWorkspace.tsx, RecurringWorkspace.tsx.
- Why: These are where "did that work?" moments and amateur signals concentrate.
- Risk: Medium (most JSX churn) — keep service-layer calls byte-identical.
- Verification: full CRUD on each screen incl. error paths (delete with balance reversal
  failure); npm.cmd run test (service tests unaffected proves logic untouched).
Phase 4: Mobile Pass + Navigation
- Change: 5-tab bottom nav (Reports/Settings promoted; Budgets→Reports tab or Home card,
  Recurring→Transactions tab) OR minimally keep 7 with fixed More-close if merging feels too
  big; remove route-fade AnimatePresence; pb-36→pb-24; toast bottom-center; touch-target sweep;
  Settings single-column regroup with danger zone.
- Files: AppShell.tsx, SettingsWorkspace.tsx, affected page compositions.
- Why: Mobile is the declared primary platform.
- Risk: Medium if merging routes (nav habit change); Low for the minimal variant.
- Verification: every destination ≤2 taps; menu never sticks open; emulated iPhone SE +
  Pixel pass; npm.cmd run smoke:routes still green (routes unchanged or redirects added).
Phase 5: Cleanup (Reports + Conversions + copy)
- Change: Reports chart improvements (bar-list instead of pie, ₺-formatted axes, switch-style
  TRY toggle, tokenized chart colors); Conversions glass→flat migration; full copy pass
  (Problem 10 vocabulary list); delete dead recipes (shadow-glass, gradient-brand if unused,
  duplicated downloadBlob); grep gates.
- Files: ReportsWorkspace.tsx, ConversionsWorkspace.tsx, tailwind.config.ts, misc copy.
- Why: Lower frequency screens; safe to do last.
- Risk: Low-Medium (chart swap).
- Verification: report data parity vs old pie (same totals), PDF export still works,
  npm.cmd run check, final dark/light double walkthrough.
11. Verification Checklist
Commands

npm.cmd run check          # lint + typecheck + test + build, after every phase
$env:TAPTRACK_SMOKE_BASE_URL="http://127.0.0.1:3002"; npm.cmd run smoke:routes
Desktop


 All 7 screens render in light and dark with no light-mode remnants in dark (cards, toasts, dialogs, chart tooltips, hovers).

 One primary-button style everywhere; one card recipe; one input radius.

 Dashboard at 1440px doesn't stretch content edge-to-edge; capture card is visually first.
Mobile (390px and 360px emulation)


 Sign out reachable. Every nav destination ≤2 taps. More/overflow menu (if kept) closes on navigation.

 No horizontal overflow on any screen (repeat the existing DOM smoke).

 All touch targets ≥44px (row actions, toggles, nav tabs).

 Transactions list visible without scrolling past 5 filter fields.
Keyboard


 Tab through Dashboard, Transactions form, ConfirmDialog: visible focus ring on every stop; ESC closes dialog; Enter submits command input and transaction form.
Accessibility


 No meaning-bearing text below 4.5:1 (spot-check meta rows, captions, setup error).

 Form fields all label-associated; toggles keep role="switch" + aria-checked.

 prefers-reduced-motion disables count-ups and list animations.
States


 Throttled reload: skeletons, never a 0-values flash.

 New-profile run: setup → empty dashboard with helpful CTA → first command saves with toast.

 Error paths: bad command (multi-entry), insufficient balance on save and on delete, sync-now while signed out, PDF export failure message.
Regression


 All Vitest suites pass unmodified (proves logic untouched).

 Export CSV/JSON/PDF produce same content; import + reset flows still re-seed and re-sync.

 Telegram/exchange-rate routes untouched (smoke script).
12. Open Questions
Bottom-nav consolidation (Phase 4): merging Budgets→Reports and Recurring→Transactions is the cleanest IA, but it changes your muscle memory. Minimal alternative: keep 7 destinations, just fix the More menu. Which do you prefer?
Is dark mode actually used? If yes, Phase 1 tokens are non-negotiable first. If you never use it, we could remove the toggle instead and cut the token work in half (I'd still recommend tokens — but the priority changes).
Glass identity: I'm recommending deleting the glassmorphism/gradient styling. If you're attached to it, Direction "Fintech Glass, Finished Properly" is viable — say so before Phase 1, since the Card primitive differs.
Nothing else blocks implementation — the report above is specific enough to execute phase-by-phase. Tell me which direction/plan you approve (or answer Q1–Q3) and I'll start with Phase 1.