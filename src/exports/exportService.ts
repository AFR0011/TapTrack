import { db, ensureDatabaseSeeded } from '@/database';
import { formatLocalDate } from '@/parser/parseCommand';
import type { Transaction, TapTrackDatabase } from '@/types';
import { createObjectCsvStringifier } from 'csv-writer';

export async function exportCSV(database: TapTrackDatabase = db): Promise<string> {
  await ensureDatabaseSeeded(database);
  const transactions = await database.transactions.toArray();

  const csvStringifier = createObjectCsvStringifier({
    header: [
      { id: 'id', name: 'id' },
      { id: 'type', name: 'type' },
      { id: 'amount', name: 'amount' },
      { id: 'currency', name: 'currency' },
      { id: 'title', name: 'title' },
      { id: 'categoryId', name: 'categoryId' },
      { id: 'method', name: 'method' },
      { id: 'date', name: 'date' },
      { id: 'note', name: 'note' },
      { id: 'recurringSourceId', name: 'recurringSourceId' },
      { id: 'createdAt', name: 'createdAt' },
      { id: 'updatedAt', name: 'updatedAt' },
    ],
  });

  const csvData = csvStringifier.stringifyRecords(transactions);
  // Ensure we have a header row and at least one empty line at the end
  if (!csvData.includes('id,type,amount,currency,title,categoryId,method,date,note,recurringSourceId,createdAt,updatedAt')) {
    return 'id,type,amount,currency,title,categoryId,method,date,note,recurringSourceId,createdAt,updatedAt\n\n' + csvData;
  }
  return csvData;
}

export async function exportJSON(database: TapTrackDatabase = db): Promise<string> {
  await ensureDatabaseSeeded(database);
  const data = {
    transactions: await database.transactions.toArray(),
    balances: await database.balances.toArray(),
    categories: await database.categories.toArray(),
    monthlyBudgets: await database.monthlyBudgets.toArray(),
    categoryBudgets: await database.categoryBudgets.toArray(),
    recurringTransactions: await database.recurringTransactions.toArray(),
    conversions: await database.conversions.toArray(),
    settings: await database.settings.toArray(),
  };

  return JSON.stringify(data, null, 2);
}

export async function importJSON(jsonData: string, database: TapTrackDatabase = db): Promise<void> {
  const data = JSON.parse(jsonData);

  await database.transaction('rw', database.transactions, database.balances, database.categories, database.monthlyBudgets, database.categoryBudgets, database.recurringTransactions, database.conversions, database.settings, async () => {
    // Clear existing data
    await database.transactions.clear();
    await database.balances.clear();
    await database.categories.clear();
    await database.monthlyBudgets.clear();
    await database.categoryBudgets.clear();
    await database.recurringTransactions.clear();
    await database.conversions.clear();
    await database.settings.clear();

    // Import new data
    if (data.transactions) await database.transactions.bulkPut(data.transactions);
    if (data.balances) await database.balances.bulkPut(data.balances);
    if (data.categories) await database.categories.bulkPut(data.categories);
    if (data.monthlyBudgets) await database.monthlyBudgets.bulkPut(data.monthlyBudgets);
    if (data.categoryBudgets) await database.categoryBudgets.bulkPut(data.categoryBudgets);
    if (data.recurringTransactions) await database.recurringTransactions.bulkPut(data.recurringTransactions);
    if (data.conversions) await database.conversions.bulkPut(data.conversions);
    if (data.settings) await database.settings.bulkPut(data.settings);
  });
}

export async function exportPDF(month: string): Promise<Buffer> {
  // This would typically use pdfmake to generate a PDF
  // For now, we'll create a simple text representation
  const transactions = await db.transactions.where('date').startsWith(month).toArray();

  let pdfContent = `Monthly Report for ${month}\n`;
  pdfContent += '='.repeat(50) + '\n\n';

  // Add summary
  const incomeVsExpense = await getIncomeVsExpenseSummary(month);
  pdfContent += `Income: ${incomeVsExpense.income} TRY\n`;
  pdfContent += `Expense: ${incomeVsExpense.expense} TRY\n`;
  pdfContent += `Net: ${incomeVsExpense.net} TRY\n\n`;

  // Add transactions
  pdfContent += 'Transactions:\n';
  pdfContent += '-'.repeat(50) + '\n';

  transactions
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .forEach(t => {
      pdfContent += `${t.date} - ${t.type === 'income' ? '+' : '-'}${t.amount} ${t.currency} - ${t.title}\n`;
    });

  // Convert to buffer (simplified for this implementation)
  return Buffer.from(pdfContent);
}

async function getIncomeVsExpenseSummary(month: string): Promise<{ income: number; expense: number; net: number }> {
  const transactions = await db.transactions.where('date').startsWith(month).toArray();

  let income = 0;
  let expense = 0;

  transactions.forEach(t => {
    if (t.currency === 'TRY') {
      if (t.type === 'income') {
        income += t.amount;
      } else {
        expense += t.amount;
      }
    }
  });

  return {
    income,
    expense,
    net: income - expense
  };
}