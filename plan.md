     Context

     Based on the BLUEPRINT.md and current codebase state, TapTrack is a mobile-first, local-first
     personal income and expense tracker. The project is currently in Phase 2/3 of the build order,
     with core functionality for command parsing, transaction creation, and basic dashboard
     implemented. However, the full V1 features are not yet complete.

     The main success criterion is that users can consistently log income/expenses for 30 days with
     less friction than Excel/notes. The app should make fast daily capture effortless (under 5
     seconds) while providing monthly review capabilities.

     Current State Analysis

     The codebase already implements:
     - Next.js app with PWA setup
     - Tailwind CSS styling
     - Dexie.js database with proper schema
     - Command parser for natural language input
     - Transaction creation with balance validation
     - Dashboard summary with spending metrics
     - Recent transactions list
     - Default categories and balances
     - Settings table

     Missing features that need implementation:
     1. Budget management (monthly total and category budgets)
     2. Recurring transactions
     3. Full reporting functionality
     4. Export/import capabilities
     5. Complete dashboard with budget visualization
     6. Setup flow for initial configuration

     Implementation Approach

     Phase 4 - Budgets Implementation

     1. Budget Data Models
     - Implement MonthlyBudget and CategoryBudget services
     - Add budget calculation logic
     - Add rollover functionality

     2. Budget UI Components
     - Budget dashboard summary
     - Budget creation/editing forms
     - Category budget displays

     3. Integration with Existing Features
     - Connect budget data with transaction processing
     - Update dashboard to show budget status

     Phase 5 - Recurring Transactions Implementation

     1. Recurring Transaction Services
     - Create recurring transaction management functions
     - Implement next run date calculation
     - Add auto-creation logic for missed recurring transactions

     2. Recurring Transaction UI
     - Recurring transaction creation form
     - Recurring transaction list with status
     - Edit/pause/delete functionality

     3. Integration
     - Auto-create recurring transactions on app open
     - Ensure balance updates work with recurring transactions

     Phase 6 - Reports Implementation

     1. Report Generation Services
     - getCategorySpending()
     - getSpendingOverTime()
     - getIncomeVsExpense()
     - getMonthlyComparison()
     - getBudgetPerformance()

     2. Report UI Components
     - Report page with charts using Recharts
     - Category breakdown chart
     - Spending over time chart
     - Income vs expense chart
     - Budget performance chart

     3. Report Data Access
     - Aggregate transaction data for reports
     - Connect to existing database tables

     Phase 7 - Export and Backup Implementation

     1. Export Services
     - exportCSV() - CSV transaction export
     - exportJSON() - Full backup export
     - importJSON() - Data restoration
     - exportPDF() - Detailed monthly report

     2. Export UI Components
     - Export buttons in settings
     - Import functionality in settings
     - Export confirmation modals

     Key Implementation Details

     Budget Implementation:
     - Monthly budget rollover logic: unused amount from previous month rolls over to next month's
     total budget
     - Category budgets: monthly only, do not roll over
     - Budget status display: show spent vs remaining for both total and category budgets

     Recurring Transactions:
     - Frequency: daily, weekly, monthly, yearly
     - Auto-creation on app open for due/missed recurring transactions
     - Next run date calculation based on frequency
     - Prevent duplicate creation on multiple app opens

     Reports:
     - Use Recharts for visualization
     - Include all required report types from blueprint
     - PDF reports should include detailed transaction lists

     Export/Import:
     - JSON backup should include all data tables
     - CSV export should include standard transaction columns
     - Import should restore full local database

     Critical Files to Modify

     1. Database Services - Add budget and recurring transaction table methods
     2. Budget Services - Create budget calculation and rollover logic
     3. Recurring Services - Create recurring transaction processing logic
     4. Report Services - Implement all required report generation functions
     5. Export Services - Implement CSV, JSON, and PDF export functions
     6. UI Components - Add budget, recurring, and report screens
     7. Dashboard - Update to show budget information

     Testing Strategy

     1. Unit tests for all new services (budget, recurring, reports, exports)
     2. Integration tests for data flow between components and database
     3. End-to-end tests for user flows (command entry, budget creation, report viewing)
     4. Test edge cases (negative balances, budget limits, export/import scenarios)

     Verification

     1. Run existing tests to ensure no regressions
     2. Test all new functionality end-to-end
     3. Verify that the 5-second logging requirement is met
     4. Ensure all acceptance criteria from blueprint are satisfied
     5. Test offline functionality and data persistence