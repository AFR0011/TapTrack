import { getTransactionBalanceDelta } from './src/balances/balanceEffects';

// Test the function
console.log('Expense with amount 200:', getTransactionBalanceDelta({ type: 'expense', amount: 200 }));
console.log('Income with amount 200:', getTransactionBalanceDelta({ type: 'income', amount: 200 }));

// This should be -200 for expense and 200 for income