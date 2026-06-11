1. **Commit to one visual direction: Calm Personal Ledger**

   **Files:** whole UI, especially `AppShell.tsx`, `DashboardSummary.tsx`, `CommandInput.tsx`, `ConversionsWorkspace.tsx`.

   Replace the mixed glass/gradient/admin style with one calm flat system: solid surfaces, 1px borders, one blue accent, semantic green/red only for money states.

   **Remove/avoid:** `shadow-glass`, `backdrop-blur`, gradient cards, hover shadows on non-clickable cards.

   **Verify:** all screens should feel like the same app, not like dashboard and settings were designed by two tired interns from rival startups.

2. **Replace the dark-mode CSS override hack with real semantic tokens**

   **Files:** `app/globals.css`, `tailwind.config.ts`.

   Current dark mode only overrides a few light classes like `.dark .bg-white`, which misses gradients, colored cards, hovers, toasts, charts, and tooltips.

   Add semantic CSS variables:

   ```css
   --bg;
   --surface;
   --surface-muted;
   --surface-raised;
   --text-primary;
   --text-secondary;
   --text-muted;
   --border;
   --accent;
   --accent-muted;
   --danger;
   --success;
   --warning;
   ```

   Map them into Tailwind as `bg-surface`, `text-secondary`, `border-default`, etc.

   **Verify:** toggle dark mode and inspect every screen, toast, dialog, chart tooltip, hover state, and active nav item.

3. **Create shared UI primitives before redesigning everything**

   **Files:** create under `src/components/ui/`.

   Add:

   ```txt
   Button.tsx
   Card.tsx
   Field.tsx
   SelectField.tsx
   PageHeader.tsx
   EmptyState.tsx
   Skeleton.tsx
   ProgressBar.tsx
   StatRow.tsx
   Toggle.tsx
   ```

   Each primitive should include default spacing, radius, focus state, disabled state, dark-mode support, and mobile touch size.

   **Verify:** new components can replace duplicated local `Input`, `Select`, `Metric`, `MetricRow`, `BudgetMetric`, and card recipes.

4. **Standardize buttons**

   **Files:** all workspaces.

   Replace ad-hoc button classes with `Button` variants:

   ```txt
   primary: blue solid
   secondary: bordered neutral
   ghost: text/transparent
   danger: red
   subtle: muted background
   ```

   All buttons should have:

   ```txt
   min-height: 44px on mobile
   visible focus ring
   disabled cursor/opacity
   consistent radius
   consistent font weight
   ```

   **Verify:** search for raw `bg-blue-500`, `bg-gradient`, `rounded-md px-4 py-2` button recipes and reduce them hard.

5. **Fix mobile sign-out**

   **Files:** `AppShell.tsx`, `SettingsWorkspace.tsx`.

   Right now sign-out exists only in the desktop header. Mobile users cannot sign out. Tiny little UX hostage situation.

   Add an **Account** section in Settings:

   ```txt
   Account
   Signed in as <email if available>
   Sign out
   ```

   Move or duplicate the `handleSignOut` logic from `AppShell.tsx`.

   **Verify:** 390px viewport → Settings → Sign out → redirects to `/login`.

6. **Fix mobile navigation**

   **Files:** `AppShell.tsx`.

   Current bottom nav shows:

   ```txt
   Home / History / Transfer / Budgets / Recurring / More
   ```

   But Reports and Settings are buried in More, despite being higher-level destinations.

   Replace with 5 tabs:

   ```txt
   Home
   History
   Transfer
   Reports
   Settings
   ```

   Then move:

   ```txt
   Budgets → Reports or Dashboard card
   Recurring → History/Transactions subtab or Settings/Data section
   ```

   Minimal fallback: keep More, but close the `<details>` menu after navigation.

   **Verify:** every major destination is reachable in one tap or two taps max, and no dropdown stays open after navigation.

7. **Remove page-level route fade animation**

   **Files:** `AppShell.tsx`.

   Remove the route-level `AnimatePresence` around `motion.main`. It remounts screens, makes navigation feel slower, and retriggers number animations.

   Keep animation only where it helps:

   ```txt
   nav active pill
   command preview opening
   list item insertion/removal
   progress bar fill
   ```

   **Verify:** tab switching feels instant; dashboard numbers do not re-count every time.

8. **Fix toast placement and theming**

   **Files:** `ToastProvider.tsx`.

   Current toast is hardcoded white and top-right. Bad for dark mode, bad for mobile thumb usage.

   Change to:

   ```txt
   position: bottom-center
   dark-aware surface/text/border tokens
   mobile-safe bottom offset above nav
   ```

   **Verify:** save a transaction in light and dark mode on mobile.

9. **Redesign Dashboard as the daily command surface**

   **Files:** `app/(authenticated)/app/page.tsx`, `CommandInput.tsx`, `DashboardSummary.tsx`, `RecentTransactions.tsx`.

   Current dashboard is too wide and the core capture action is not visually dominant.

   New structure:

   ```txt
   max-w-2xl page
   1. Quick command card
   2. Month status card
   3. Balance chips
   4. Recent transactions
   ```

   Remove the explanatory paragraph:

   ```txt
   "Command-first logging with live balances..."
   ```

   The UI should explain itself. Shocking concept, apparently.

   **Verify:** on first open, the eye lands on the command input immediately.

10. **Make `CommandInput` the hero component**

**Files:** `CommandInput.tsx`.

Apply:

```txt
input height: h-12 / min-h-12
text-base on mobile
strong card treatment
autofocus on desktop
aria-label for input
example chips: "-120 coffee cash", "+20000 salary card"
success toast after save
role="alert" for errors
clearer multi-entry error list
```

Current save succeeds silently. Add:

```txt
"Saved 1 transaction."
"Saved 3 transactions."
```

**Verify:** bad command, multi-command, AI suggestion, balance failure, and successful save all have clear feedback.

11. **Fix loading states and number animation**

**Files:** `DashboardSummary.tsx`, `RecentTransactions.tsx`, all `useLiveQuery` screens, `AnimatedNumber.tsx`.

Many queries default to `[]`, so screens briefly show empty/zero before data arrives.

Change pattern:

```ts
const data = useLiveQuery(...); // undefined while loading
```

Render skeletons while `undefined`.

Update `AnimatedNumber`:

```txt
first mount: render final value immediately
later changes: animate from previous value
respect prefers-reduced-motion
```

**Verify:** hard refresh dashboard. No fake `0 ₺` flash.

12. **Use one progress bar component everywhere**

**Files:** `DashboardSummary.tsx`, `BudgetsWorkspace.tsx`, `ReportsWorkspace.tsx`, new `ProgressBar.tsx`.

Progress behavior:

```txt
0–79%: accent blue
80–99%: amber warning
100%+: red danger
```

Add labels where needed:

```txt
72% used
8,300 ₺ remaining
```

**Verify:** dashboard, budgets, and reports use identical progress styling.

13. **Fix budget editing UX**

**Files:** `BudgetsWorkspace.tsx`.

Current values are placeholders, not actual input values. That is how users accidentally trust ghosts.

Change monthly and category budget inputs to:

```txt
controlled value initialized to current budget
Save disabled until changed
success toast after save
reset dirty state after save
```

Make **Remaining** the dominant number, not one equal metric among four.

**Verify:** open Budgets; existing numbers are visible inside inputs; Save is disabled until editing.

14. **Fix balance editing UX in Settings**

**Files:** `SettingsWorkspace.tsx`, `BalanceRow`.

Current balance editing uses empty `New amount` placeholders. Replace with:

```txt
input prefilled with current balance
Save disabled until changed
validation error if invalid
success toast
```

**Verify:** Settings → balances → edit amount → save → value updates and toast appears.

15. **Restructure Settings into clearer sections**

**Files:** `SettingsWorkspace.tsx`.

Current Settings is a dense pile of cards. Use a single-column `max-w-2xl` layout with sections:

```txt
Account
Preferences
Money
Categories
Sync
Data & Export
Danger Zone
```

Move reset into a visually separate danger zone.

**Verify:** user can find sign-out, dark mode, balances, export, and reset without scanning six equal-weight cards.

16. **Simplify Sync status**

**Files:** `SettingsWorkspace.tsx`.

Replace five metric boxes:

```txt
Account / Network / Last pull / Last push / Pending retries
```

With one status sentence:

```txt
Synced 2 min ago · Online · 0 pending
```

Put details behind a collapsible area.

**Verify:** Settings sync area reads like user information, not server diagnostics.

17. **Fix category manager mobile layout and accessibility**

**Files:** `SettingsWorkspace.tsx`.

Current category form uses a five-column grid and unlabeled controls.

Apply:

```txt
sentence-case labels
labelled color picker
labelled icon select
full-width fields on mobile
44px Edit/Delete touch targets
category type as badge
color dot preserved
```

**Verify:** 360px viewport has no cramped category row or tiny text-only buttons.

18. **Collapse Transactions filters on mobile**

**Files:** `TransactionsWorkspace.tsx`.

Current mobile layout shows five filters before the transaction list. Daily users do not open history to admire filter controls. Usually.

Mobile layout:

```txt
visible: Search + Month
hidden behind "Filters": Type, Method, Category
```

Desktop can keep a toolbar.

**Verify:** on mobile, transaction rows are visible without scrolling through a filter wall.

19. **Group transaction rows by date**

**Files:** `TransactionsWorkspace.tsx`.

Since rows are date-sorted already, group them:

```txt
Today
Yesterday
2026-06-08
```

Add date headers and keep amount right-aligned with `tabular-nums`.

**Verify:** history becomes scannable instead of one undifferentiated ledger slab.

20. **Improve transaction row actions**

**Files:** `TransactionsWorkspace.tsx`.

Current rows show `Edit` and `Delete` text buttons on every row, creating noise.

Better:

```txt
click row or pencil icon → edit
overflow/menu or trash icon → delete
destructive action still uses ConfirmDialog
44px hit area
```

**Verify:** row looks cleaner but edit/delete remain discoverable.

21. **Make transaction form a real form**

**Files:** `TransactionsWorkspace.tsx`.

Current `TransactionForm` uses a button with `onClick`, not `<form onSubmit>`.

Change:

```tsx
<form onSubmit={...}>
```

Add Enter-submit behavior, validation alert, and consistent field primitives.

**Verify:** pressing Enter submits where appropriate; errors are announced and visible.

22. **Fix recurring transaction UX**

**Files:** `RecurringWorkspace.tsx`.

Apply:

```txt
"Run due check" → "Process due items"
"Created 2, skipped 0, failed 0" → "Added 2 scheduled transactions"
show skipped/failed only if nonzero
add ConfirmDialog before delete
show Active/Paused badge per row
Pause/Resume as toggle or clear secondary action
```

**Verify:** recurring list clearly shows what will run and when.

23. **Improve Reports mobile hierarchy**

**Files:** `ReportsWorkspace.tsx`.

On mobile, show the answers before controls:

```txt
Income
Expenses
Net
then period controls
then charts
```

Keep controls above metrics on desktop only if it still feels better.

**Verify:** mobile reports answer “how did I do?” immediately.

24. **Replace the pie chart with a category bar list**

**Files:** `ReportsWorkspace.tsx`.

Current pie chart has no legend, labels only on hover, and weak mobile usability.

Replace with:

```txt
Category name
horizontal bar
amount
percentage
```

This is more readable, especially on touch devices.

**Verify:** user can read category spending without hovering.

25. **Format chart axes and tooltips**

**Files:** `ReportsWorkspace.tsx`.

Apply:

```txt
Y-axis: compact currency, e.g. 12k ₺
tooltip: tokenized dark-aware style
chart colors: semantic/tokenized, not hardcoded hex
```

**Verify:** reports work in dark mode and values read as money, not random chart integers.

26. **Add clear currency-scope messaging in Reports**

**Files:** `ReportsWorkspace.tsx`.

Current report logic excludes non-TRY transactions unless `unifyToTRY` is enabled. That is dangerous UX because users may think data disappeared.

Add visible note:

```txt
Showing TRY transactions only. Enable "Convert all to TRY" to include USD/EUR.
```

Use a real switch for `unifyToTRY`, not a button-looking toggle.

**Verify:** with USD/EUR transactions, user understands why totals change.

27. **Keep Conversions structure, but flatten its styling**

**Files:** `ConversionsWorkspace.tsx`.

This is one of the better screens structurally. Do not over-redesign it.

Apply:

```txt
replace glass card with Card primitive
label all amount/select fields properly
replace text arrow "↓" with icon or divider component
use primary Button primitive
tokenized source/destination highlights
```

**Verify:** same flow, cleaner style, dark mode works.

28. **Improve Setup flow**

**Files:** `SetupForm.tsx`, `SetupGate.tsx`.

Fix immediately:

```txt
text-red-300 → text-red-600 or danger token
error should be in bordered danger box
```

Then make setup less intimidating:

```txt
"Welcome to TapTrack"
TRY cash/card first
USD/EUR behind "Add foreign currency balances"
monthly budget and default method second
```

**Verify:** first-time user can complete setup without staring at a 3-currency matrix like it is a tax confession form.

29. **Tokenize Login**

**Files:** `app/(auth)/login/page.tsx`.

Login is acceptable, but still uses gradient brand styling. Convert to the same Button/Card/Field primitives.

Keep the sign-in/register switcher.

**Verify:** login feels like the same product as the app.

30. **Run a full copy pass**

**Files:** all components.

Replace developer vocabulary:

```txt
"Local-first finance console" → "Personal finance tracker"
"Last-used method fallback" → "Default payment method"
"Run due check" → "Process due items"
"Preparing local ledger..." → "Preparing TapTrack..."
"Pending retries" → hide under sync details
```

Also change uppercase micro-labels to sentence-case.

**Verify:** read every visible string aloud. If it sounds like a database admin panel, rewrite it.

31. **Add visible focus states everywhere**

**Files:** all interactive components, ideally through primitives.

There are basically no `focus-visible` classes outside switches.

Add:

```txt
focus-visible:outline
focus-visible:outline-2
focus-visible:outline-offset-2
focus-visible:outline-accent
```

**Verify:** keyboard-tab through Dashboard, Transactions, Settings, ConfirmDialog.

32. **Fix small touch targets**

**Files:** all row actions, mobile nav, category buttons, command preview revert button.

Anything clickable should be at least about 44×44px on mobile.

Convert tiny text links like:

```txt
revert
Edit
Delete
```

into padded buttons or icon buttons with labels.

**Verify:** inspect mobile viewport; no clickable text is tiny.

33. **Add `role="alert"` / `aria-live` to important feedback**

**Files:** `CommandInput.tsx`, `TransactionsWorkspace.tsx`, `ConversionsWorkspace.tsx`, `SetupForm.tsx`, `RecurringWorkspace.tsx`.

Errors and save feedback should be accessible.

Use:

```tsx
role="alert"
aria-live="polite"
```

**Verify:** errors are visually clear and screen-reader friendly.

34. **Remove hover shadows from non-interactive cards**

**Files:** many components.

Current `hover:shadow-md` suggests cards are clickable when they are not.

Rule:

```txt
Non-clickable cards: no hover elevation
Clickable rows/cards: visible hover + cursor + action
```

**Verify:** hover affordance only appears where click/tap does something.

35. **Add skeleton states**

**Files:** Dashboard, Transactions, Budgets, Reports, Settings, Recurring, Conversions.

Use new `Skeleton` primitive.

Replace false empty states while loading with skeletons.

**Verify:** throttled reload shows skeletons, not empty app/data.

36. **Clean up duplicated helper/components**

**Files:** `ReportsWorkspace.tsx`, `SettingsWorkspace.tsx`, `TransactionsWorkspace.tsx`, `RecurringWorkspace.tsx`.

Consolidate:

```txt
downloadBlob / downloadText
FormInput / Input
FormSelect / Select
Metric / MetricRow / BudgetMetric
EmptyState clones
ProgressBar clones
```

**Verify:** fewer local mini-components, more shared primitives.

37. **Dark-mode chart/toast/dialog sweep**

**Files:** `ReportsWorkspace.tsx`, `ToastProvider.tsx`, `ConfirmDialog.tsx`.

Ensure these are tokenized:

```txt
Recharts tooltip background
Recharts label text
ConfirmDialog panel
overlay
toast
chart colors
```

**Verify:** dark mode has no random white tooltip/dialog/toast leftovers.

38. **Reduce dashboard max width**

**Files:** `AppShell.tsx`, `app/(authenticated)/app/page.tsx`.

AppShell uses `max-w-7xl`, which is fine for reports but too wide for daily capture.

Use page-specific wrappers:

```txt
Dashboard: max-w-2xl or max-w-3xl
Settings: max-w-2xl
Reports: max-w-7xl
Transactions: max-w-5xl or max-w-6xl
```

**Verify:** dashboard no longer feels stretched on desktop.

39. **Add one reusable `PageHeader`**

**Files:** all page routes/components.

Standardize:

```txt
title
one-line subtitle
optional action slot
optional compact mode
```

Remove over-explaining subtitles.

**Verify:** every page header has the same rhythm.

40. **Final verification checklist**

After implementation, run:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run smoke:routes
```

Manual checks:

```txt
light mode walkthrough
dark mode walkthrough
390px mobile walkthrough
keyboard-only walkthrough
setup → first transaction → budget → report flow
transaction CRUD
recurring CRUD
export/import/reset
toast/dialog/chart states
no horizontal overflow
no tiny touch targets
no fake zero loading states
```
