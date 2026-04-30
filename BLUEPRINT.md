# TapTrack — Initial Product Blueprint

## 1. Product Summary

**TapTrack** is a mobile-first, local-first personal income and expense tracker designed to replace messy spreadsheet/note-based tracking with fast daily logging, simple monthly budgeting, minimal balance tracking, and clear reports.

The product is for **one personal user first**. It is not a general accounting system, business finance system, tax tool, family budgeting app, or bank-sync platform.

The core value is:

> Log income and expenses in seconds, keep basic balances accurate, and review monthly spending without maintaining spreadsheets manually.

The main success criterion is:

> The user can consistently log income/expenses for 30 days with less friction than Excel/notes.

---

## 2. Primary Goal

Build a personal finance tracker optimized for **fast daily capture** and **monthly review**.

The app should make this flow effortless:

```text
-120 coffee cash
+20000 salary card
-500 rent card
````

Then show:

* today's spending
* monthly spending
* remaining monthly budget
* current balances
* recent transactions
* reports
* exportable records

---

## 3. Core Product Principle

Logging speed is more important than deep accounting.

Target:

```text
Normal transaction logging should take under 5 seconds.
```

Reviewing and reporting can be deeper, but daily capture must stay lightweight.

---

## 4. Target User

### V1 User

* Single personal user
* Tracks personal expenses and income
* Uses TRY, USD, and EUR
* Currently uses Excel/spreadsheets and notes
* Wants lower friction and more consistency

### Not V1 Users

Do not optimize V1 for:

* families
* teams
* small businesses
* accountants
* tax reporting
* shared wallets
* bank-import users
* multi-user households

---

## 5. V1 Scope

### Must Have

1. Fast income/expense command entry
2. Manual form entry
3. Preview-before-save behavior
4. Income and expense tracking
5. Minimal balance tracking
6. TRY, USD, EUR support
7. Cash/card methods
8. Monthly total budget
9. Monthly category budgets
10. Rollover for total monthly budget only
11. Recurring transactions
12. Dashboard
13. Reports
14. CSV export
15. JSON backup/export/import
16. Detailed PDF transaction report
17. Local-first offline support
18. Category icons/colors
19. Initial setup flow

---

## 6. Explicit Non-Goals for V1

Do **not** build these in V1:

* cloud sync
* multi-device sync
* real Telegram bot
* receipt/photo scanning
* bank import
* AI categorization
* user accounts/login
* full wallet/accounting system
* multiple custom bank accounts
* tax reports
* debt/loan tracking
* family/team sharing
* advanced investment tracking
* automatic currency conversion in reports
* exchange-rate API
* push notifications
* app-store native deployment

These can be considered later, but only after the local MVP is proven useful.

---

## 7. Recommended Tech Stack

### Recommended V1 Stack

```text
Next.js
React
TypeScript
PWA
Dexie.js / IndexedDB
Zustand
Tailwind CSS
Recharts
PapaParse
pdfmake or jsPDF
```

### Why This Stack

Use a Next.js PWA because:

* fast to build
* mobile-first web app
* installable on phone
* offline-capable
* easier than native app deployment
* good portfolio value
* local-first data is straightforward with IndexedDB
* future Supabase sync can be added later

### Do Not Use in V1

```text
Supabase
Firebase
React Native
Flutter
Backend server
Real Telegram bot
External AI APIs
Banking APIs
```

Supabase can be added later for optional sync.

---

## 8. App Name

Working name:

```text
TapTrack
```

Name is acceptable for now. Do not over-optimize naming before MVP exists.

Possible later alternatives:

```text
SpendTap
LedgerLite
PocketLog
DailyLedger
FlowLedger
CashTrail
```

---

## 9. Main User Flows

## 9.1 First-Time Setup Flow

On first launch, the user must configure:

### Required Setup

```text
Default currency: TRY
Initial balances:
- TRY cash
- TRY card
- USD cash
- USD card
- EUR cash
- EUR card

Monthly total budget
Default categories
Last-used payment method behavior
```

### Optional Setup

```text
Category budgets
Recurring transactions
Custom categories
```

### Important Rule

Because negative balances are blocked, the app must ask for initial balances before allowing normal expense logging.

Otherwise a transaction like this would fail immediately:

```text
-120 coffee cash
```

if the starting cash balance is `0`.

---

## 9.2 Fast Command Entry Flow

User enters:

```text
-120 coffee cash
```

System parses:

```text
Type: expense
Amount: 120
Currency: TRY
Title: coffee
Method: cash
Category: Food
Date: today
```

Then shows preview:

```text
Expense
Amount: 120 TRY
Title: coffee
Category: Food
Method: Cash
Date: Today

[Save] [Edit] [Cancel]
```

User confirms.

System saves transaction and updates balance.

---

## 9.3 Income Entry Flow

User enters:

```text
+20000 salary card
```

System parses:

```text
Type: income
Amount: 20000
Currency: TRY
Title: salary
Method: card
Category: Income
Date: today
```

System increases TRY card balance by 20000.

---

## 9.4 Manual Entry Flow

Manual entry is a fallback, not the main path.

Fields:

```text
Type: income | expense
Amount
Currency
Title
Category
Method
Date
Note
```

Manual entry should support backdated transactions.

---

## 9.5 Asset Conversion Flow

User records currency conversion manually.

Example:

```text
convert 100 usd to 3200 try cash
```

Effect:

```text
USD cash -= 100
TRY cash += 3200
```

Important:

```text
Conversion is not income.
Conversion is not expense.
Conversion does not affect spending reports.
Conversion does affect balances.
```

---

## 9.6 Recurring Transaction Flow

User creates recurring transaction manually.

Examples:

```text
Rent
Salary
Spotify
Gym
Internet
```

Recurring transaction fields:

```text
Type
Amount
Currency
Title
Category
Method
Frequency
Start date
Optional end date
Next run date
Active/inactive
```

Recurring transactions auto-create on the due date.

Because V1 is a PWA, true background execution should not be assumed.

Implementation rule:

> On app open, check for due or missed recurring transactions and create them automatically.

---

## 9.7 Monthly Review Flow

User opens monthly review/report page.

The page shows:

* total income
* total expenses
* net amount
* spending by category
* spending over time
* budget usage
* monthly comparison
* detailed transaction list
* export PDF/CSV/JSON options

---

## 10. Command Syntax

## 10.1 Primary Transaction Syntax

Use this command structure:

```text
[+/-][amount] [optional currency] [title words] [optional method]
```

Examples:

```text
-120 coffee cash
-80 lunch card
+20000 salary card
-15 usd coffee cash
-9.99 eur spotify card
```

## 10.2 Type Rules

```text
- = expense
+ = income
```

If no sign is provided, show an error or ask user to choose type.

Do not guess income/expense from title in V1.

## 10.3 Currency Rules

Supported currencies:

```text
TRY
USD
EUR
```

Default currency:

```text
TRY
```

Accepted currency tokens should include:

```text
try
tl
₺
usd
$
eur
€
```

If omitted:

```text
currency = TRY
```

## 10.4 Payment Method Rules

Supported methods:

```text
cash
card
```

Default method:

```text
Remember last used method
```

If omitted:

```text
method = lastUsedMethod
```

If no last-used method exists:

```text
method = card
```

## 10.5 Title Rules

The title is whatever remains after extracting:

* sign
* amount
* currency
* method

Example:

```text
-120 coffee cash
```

Title:

```text
coffee
```

Example:

```text
-500 grocery shopping card
```

Title:

```text
grocery shopping
```

---

## 11. Category Rules

## 11.1 Default Categories

V1 default expense categories:

```text
Food
Rent
Subscriptions
Fun
Other
```

Income does not need detailed categories in V1.

Use default income category:

```text
Income
```

## 11.2 Category Suggestion

Use simple local rules, not AI.

Example keyword map:

```ts
{
  "coffee": "Food",
  "lunch": "Food",
  "dinner": "Food",
  "market": "Food",
  "grocery": "Food",
  "rent": "Rent",
  "spotify": "Subscriptions",
  "netflix": "Subscriptions",
  "youtube": "Subscriptions",
  "game": "Fun",
  "cinema": "Fun",
  "movie": "Fun"
}
```

If no rule matches:

```text
category = Other
```

The user can edit the category in preview before saving.

---

## 12. Balance Logic

## 12.1 Minimal Balances

The app tracks six balances:

```text
TRY cash
TRY card
USD cash
USD card
EUR cash
EUR card
```

Do not create full wallet/account complexity in V1.

No bank-specific accounts such as:

```text
Garanti card
PayPal
Wise
Crypto wallet
Savings account
```

## 12.2 Expense Balance Update

Example:

```text
-120 coffee cash
```

Effect:

```text
TRY cash -= 120
```

## 12.3 Income Balance Update

Example:

```text
+20000 salary card
```

Effect:

```text
TRY card += 20000
```

## 12.4 Negative Balance Rule

Negative balances are blocked.

If a transaction would make a balance negative, block it.

Example message:

```text
Not enough TRY cash balance. Adjust balance or choose another method.
```

The transaction should not be saved.

## 12.5 Editing Transaction Balance Rule

When editing a transaction, reverse the old transaction effect first, then apply the new transaction effect.

Example:

Original:

```text
-100 coffee cash
```

New:

```text
-120 coffee card
```

System should:

```text
TRY cash += 100
TRY card -= 120
```

Then validate no balance goes negative.

## 12.6 Deleting Transaction Balance Rule

When deleting a transaction, reverse its balance effect.

Expense deletion:

```text
Deleted -120 coffee cash
TRY cash += 120
```

Income deletion:

```text
Deleted +20000 salary card
TRY card -= 20000
```

If deleting income would cause balance inconsistency, still allow deletion only if resulting balance is not negative.

---

## 13. Budget Logic

## 13.1 Budget Currency

Budgets are TRY-only in V1.

No USD/EUR budgets in V1.

## 13.2 Budget Types

V1 supports:

```text
Total monthly budget
Category monthly budgets
```

## 13.3 Rollover

Rollover applies only to the total monthly budget.

Category budgets do not roll over.

Example:

```text
Monthly budget: 20000 TRY
Spent: 18000 TRY
Unused: 2000 TRY
Next month rollover: +2000 TRY
```

Next month available total budget:

```text
new monthly budget + previous rollover
```

## 13.4 Category Budget Behavior

Category budgets are monthly only.

Example:

```text
Food budget: 5000 TRY
Food spent: 4200 TRY
Remaining: 800 TRY
```

Unused category budget does not roll over.

## 13.5 Budget Warnings

V1 does not warn before or after overspending.

The app only shows budget status in reports/dashboard.

---

## 14. Reports

## 14.1 Required V1 Reports

Reports must include:

```text
Spending by category
Spending over time
Income vs expense
Monthly comparison
Budget performance
Full detailed PDF transaction report
```

## 14.2 Currency Behavior in Reports

V1 does not convert USD/EUR to TRY.

For V1:

```text
TRY reports are primary.
USD/EUR transactions can be shown separately.
No automatic exchange-rate conversion.
```

Currency conversion in reports is a later feature.

## 14.3 Report Time Periods

At minimum:

```text
Current month
Previous month
Custom month selector
```

Later:

```text
Custom date ranges
Yearly reports
```

---

## 15. Exports and Backups

## 15.1 CSV Export

CSV should export transactions.

Recommended columns:

```text
id
type
amount
currency
title
category
method
date
note
recurringSourceId
createdAt
updatedAt
```

## 15.2 JSON Backup

JSON backup should include:

```text
transactions
balances
categories
monthlyBudgets
categoryBudgets
recurringTransactions
conversions
settings
```

JSON import should restore the local database.

## 15.3 PDF Report

PDF report should be a full detailed transaction report.

Minimum PDF content:

```text
Month
Total income
Total expenses
Net
Budget summary
Category spending
Transaction list
Generated timestamp
```

---

## 16. Screens

## 16.1 Setup Screen

Purpose:

Initialize the app.

Fields:

```text
Initial balances
Monthly budget
Default categories
Default method behavior
```

Should only show on first use unless reset.

---

## 16.2 Dashboard Screen

Must show:

```text
Quick command input
Today spent
Monthly spent / monthly budget
Remaining budget
Current balances
Recent transactions
```

Dashboard should be the default screen.

---

## 16.3 Transaction Preview Modal

After command input, show parsed transaction before saving.

Fields shown:

```text
Type
Amount
Currency
Title
Category
Method
Date
Note
```

Actions:

```text
Save
Edit
Cancel
```

---

## 16.4 Add/Edit Transaction Screen

Manual transaction form.

Fields:

```text
Type
Amount
Currency
Title
Category
Method
Date
Note
```

Must support editing and backdating.

---

## 16.5 Transactions Screen

Features:

```text
Search
Filter by month
Filter by category
Filter by method
Filter by income/expense
Edit transaction
Delete transaction
Add backdated transaction
```

---

## 16.6 Budgets Screen

Features:

```text
Set monthly total budget
View rollover
Set category budgets
Budget usage bars
```

---

## 16.7 Recurring Screen

Features:

```text
Create recurring transaction
Edit recurring transaction
Pause recurring transaction
Delete recurring transaction
View next due date
```

---

## 16.8 Reports Screen

Charts:

```text
Spending by category
Spending over time
Income vs expense
Monthly comparison
Budget performance
```

---

## 16.9 Settings Screen

Features:

```text
Manage categories
Manage balances
Default method behavior
Export CSV
Export JSON backup
Import JSON backup
Export PDF report
Reset app data
```

---

## 17. Data Model

## 17.1 Shared Types

```ts
type Currency = "TRY" | "USD" | "EUR";
type Method = "cash" | "card";
type TransactionType = "income" | "expense";
type Frequency = "daily" | "weekly" | "monthly" | "yearly";
```

---

## 17.2 Transaction

```ts
interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  currency: Currency;
  title: string;
  categoryId: string;
  method: Method;
  date: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
  recurringSourceId?: string;
}
```

---

## 17.3 Balance

```ts
interface Balance {
  id: string;
  currency: Currency;
  method: Method;
  amount: number;
  updatedAt: string;
}
```

---

## 17.4 Category

```ts
interface Category {
  id: string;
  name: string;
  icon?: string;
  color?: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}
```

---

## 17.5 Monthly Budget

```ts
interface MonthlyBudget {
  id: string;
  month: string; // "YYYY-MM"
  totalBudget: number;
  rolloverFromPreviousMonth: number;
  currency: "TRY";
  createdAt: string;
  updatedAt: string;
}
```

---

## 17.6 Category Budget

```ts
interface CategoryBudget {
  id: string;
  month: string; // "YYYY-MM"
  categoryId: string;
  amount: number;
  currency: "TRY";
  createdAt: string;
  updatedAt: string;
}
```

---

## 17.7 Recurring Transaction

```ts
interface RecurringTransaction {
  id: string;
  type: TransactionType;
  amount: number;
  currency: Currency;
  title: string;
  categoryId: string;
  method: Method;
  frequency: Frequency;
  startDate: string;
  endDate?: string;
  nextRunDate: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
```

---

## 17.8 Conversion

```ts
interface Conversion {
  id: string;
  fromCurrency: Currency;
  toCurrency: Currency;
  fromAmount: number;
  toAmount: number;
  method: Method;
  date: string;
  note?: string;
  createdAt: string;
}
```

---

## 17.9 Settings

```ts
interface Settings {
  id: string;
  defaultCurrency: "TRY";
  lastUsedMethod: Method;
  setupCompleted: boolean;
  createdAt: string;
  updatedAt: string;
}
```

---

## 18. IndexedDB / Dexie Tables

Recommended tables:

```ts
db.version(1).stores({
  transactions: "id, type, date, categoryId, method, currency, recurringSourceId",
  balances: "id, currency, method",
  categories: "id, name",
  monthlyBudgets: "id, month",
  categoryBudgets: "id, month, categoryId",
  recurringTransactions: "id, nextRunDate, isActive",
  conversions: "id, date, fromCurrency, toCurrency",
  settings: "id"
});
```

---

## 19. Core Services

The app should be organized around services/modules.

Recommended modules:

```text
parser/
  parseCommand.ts

transactions/
  createTransaction.ts
  updateTransaction.ts
  deleteTransaction.ts
  validateTransaction.ts

balances/
  applyTransactionEffect.ts
  reverseTransactionEffect.ts
  validateSufficientBalance.ts
  applyConversion.ts

budgets/
  getMonthlyBudgetStatus.ts
  calculateRollover.ts
  getCategoryBudgetStatus.ts

recurring/
  createDueRecurringTransactions.ts
  calculateNextRunDate.ts

reports/
  getCategorySpending.ts
  getSpendingOverTime.ts
  getIncomeVsExpense.ts
  getMonthlyComparison.ts
  getBudgetPerformance.ts

exports/
  exportCSV.ts
  exportJSON.ts
  importJSON.ts
  exportPDF.ts
```

---

## 20. Build Order

## Phase 1 — Skeleton and Local Database

Build:

```text
Next.js app
PWA setup
Tailwind setup
Dexie database
default categories
settings table
first-time setup screen
initial balances
```

Do not build reports yet.

---

## Phase 2 — Fast Logging Core

Build:

```text
command parser
transaction preview modal
save transaction
balance update logic
negative-balance blocking
recent transactions list
```

This is the product spine.

Do not move on until this feels smooth.

---

## Phase 3 — Dashboard

Build:

```text
today spending
monthly spending
monthly budget remaining
current balances
recent transactions
quick command entry
```

---

## Phase 4 — Budgets

Build:

```text
monthly total budget
category budgets
rollover calculation
budget usage display
```

---

## Phase 5 — Recurring Transactions

Build:

```text
recurring transaction CRUD
due-date checker
auto-create missed recurring transactions on app open
next due date calculation
```

---

## Phase 6 — Reports

Build:

```text
category breakdown
spending over time
income vs expense
monthly comparison
budget performance
```

Use Recharts.

---

## Phase 7 — Export and Backup

Build:

```text
CSV export
JSON backup export
JSON import
PDF detailed report
```

---

## 21. UI Direction

The UI should be:

```text
clean
finance-dashboard-like
mobile-first
fast
minimal
not playful
not notebook-like
not overdecorated
```

Use category icons/colors, but keep them functional.

Dashboard should prioritize:

```text
fast logging
budget status
current month clarity
recent transactions
```

---

## 22. Acceptance Criteria

## 22.1 Logging Acceptance

A user can enter:

```text
-120 coffee cash
```

and save it after preview.

The transaction should:

```text
be stored locally
decrease TRY cash by 120
appear in recent transactions
affect today's spending
affect monthly spending
affect Food/Other category report
```

---

## 22.2 Income Acceptance

A user can enter:

```text
+20000 salary card
```

The transaction should:

```text
be stored locally
increase TRY card by 20000
appear as income
not count as expense
affect income vs expense report
```

---

## 22.3 Negative Balance Acceptance

If TRY cash balance is 50 and user enters:

```text
-120 coffee cash
```

The app must block saving.

Expected message:

```text
Not enough TRY cash balance. Adjust balance or choose another method.
```

---

## 22.4 Budget Acceptance

If monthly budget is 20000 TRY and monthly spending is 8000 TRY, dashboard should show:

```text
Spent: 8000 TRY
Remaining: 12000 TRY
```

---

## 22.5 Rollover Acceptance

If monthly budget is 20000 TRY and monthly spending is 18000 TRY, next month rollover should be:

```text
+2000 TRY
```

Only total budget rolls over.

Category budget leftovers do not roll over.

---

## 22.6 Recurring Acceptance

If a recurring salary is due today, then on app open the app should create the salary transaction automatically.

It should not duplicate the same recurring transaction if the app is opened multiple times on the same day.

---

## 22.7 Export Acceptance

The user can export:

```text
CSV transactions
JSON full backup
PDF detailed monthly report
```

The JSON backup can be imported to restore the local database.

---

## 23. Failure Modes to Avoid

## 23.1 Overbuilding Accounting

Do not add full account/wallet logic.

V1 only needs:

```text
cash/card + TRY/USD/EUR
```

## 23.2 Building Telegram Bot Too Early

Do not build the real Telegram bot in V1.

Use in-app command input first.

## 23.3 Building Sync Too Early

Do not add Supabase or cloud sync in V1.

Use local-first storage and backup/export first.

## 23.4 Overcomplicating Categorization

Do not build AI categorization in V1.

Use simple keyword rules and manual correction.

## 23.5 Making Reports Before Logging Works

Reports are useless if daily logging is still annoying.

Command parser and preview flow come first.

---

## 24. Future Features

Potential V1.5/V2 features:

```text
Optional Supabase sync
Real Telegram bot
Multi-device support
Encrypted backups
Receipt/photo attachments
AI categorization
Bank import
Exchange-rate handling
Currency-converted reports
Advanced recurring reminders
Native mobile app
Savings goals
Debt/loan tracking
```

Do not implement these before the V1 acceptance criteria are satisfied.

---

## 25. README Guardrail

Place this near the top of the project README:

```text
TapTrack V1 exists to replace spreadsheet/note-based personal tracking with faster daily logging.

Do not add:
- cloud sync
- Telegram bot
- bank import
- AI categorization
- receipt scanning
- full accounting
- multi-user support

Until:
- command entry is smooth
- dashboard is useful
- local storage is reliable
- 30-day personal use test succeeds
```

---

## 26. Final MVP Test

The MVP is successful only if:

```text
1. A normal transaction can be logged in under 5 seconds.
2. Monthly spending can be reviewed without opening Excel.
3. Balances remain understandable.
4. The app works offline.
5. Data can be exported.
6. The user uses it for 30 days without returning to spreadsheets/notes as the main tracker.
```

If these are not true, the MVP failed, even if the app looks polished.