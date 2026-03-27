// Beancount file parser and generator

import type {
  Transaction,
  Posting,
  BalanceAssertion,
  TransactionType,
  AccountBalances,
} from '../types';

function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}

// Parse a single transaction block
function parseTransaction(block: string): Transaction | null {
  const lines = block.split('\n').filter((l) => l.trim() !== '');
  if (lines.length === 0) return null;

  const headerMatch = lines[0].match(
    /^(\d{4}-\d{2}-\d{2})\s+([*!])\s+"([^"]*)"\s+"([^"]*)"\s*(?:;\s*id:\s*(\S+))?/
  );
  if (!headerMatch) return null;

  const [, date, flag, payee, narration, existingId] = headerMatch;

  const postings: Posting[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith(';')) continue;

    const postingMatch = line.match(
      /^(\S+(?::\S+)+)\s+([-\d,.]+)\s+(\w+)/
    );
    if (postingMatch) {
      postings.push({
        account: postingMatch[1],
        amount: parseFloat(postingMatch[2].replace(/,/g, '')),
        currency: postingMatch[3],
      });
    }
  }

  if (postings.length === 0) return null;

  return {
    id: existingId || generateId(),
    date,
    flag,
    payee,
    narration,
    postings,
    raw: block,
  };
}

// Parse all transactions from a .bean file content
export function parseTransactions(content: string): Transaction[] {
  const transactions: Transaction[] = [];
  const blocks = content.split(/\n(?=\d{4}-\d{2}-\d{2}\s+[*!])/);

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    const tx = parseTransaction(trimmed);
    if (tx) {
      transactions.push(tx);
    }
  }

  return transactions;
}

// Determine transaction type based on accounts
export function getTransactionType(tx: Transaction): TransactionType {
  const accounts = tx.postings.map((p) => p.account);
  const hasExpense = accounts.some((a) => a.startsWith('Expenses:'));
  const hasIncome = accounts.some((a) => a.startsWith('Income:'));
  const hasAssets = accounts.some((a) => a.startsWith('Assets:'));
  const hasLiabilities = accounts.some((a) => a.startsWith('Liabilities:'));

  // Refund: credit side is Expenses (money coming back from expenses)
  const creditExpense = tx.postings.some(
    (p) => p.account.startsWith('Expenses:') && p.amount < 0
  );
  if (creditExpense) return 'income';

  if (hasLiabilities && hasAssets) return 'repayment';
  if (hasExpense) return 'expense';
  if (hasIncome) return 'income';
  if (hasAssets && !hasExpense && !hasIncome) return 'transfer';

  return 'expense';
}

// Get color class for transaction type
export function getTransactionColor(type: TransactionType): string {
  switch (type) {
    case 'expense':
      return 'tx-expense';
    case 'income':
      return 'tx-income';
    case 'transfer':
      return 'tx-transfer';
    case 'repayment':
      return 'tx-repayment';
  }
}

// Generate Beancount transaction text
export function generateTransaction(params: {
  readonly date: string;
  readonly payee: string;
  readonly narration: string;
  readonly postings: readonly Posting[];
}): string {
  const id = generateId();
  const lines: string[] = [];
  lines.push(
    `${params.date} * "${params.payee}" "${params.narration}" ; id: ${id}`
  );
  for (const posting of params.postings) {
    const amountStr = posting.amount.toFixed(2);
    const padding = ' '.repeat(
      Math.max(1, 50 - posting.account.length - amountStr.length)
    );
    lines.push(`    ${posting.account}${padding}${amountStr} ${posting.currency}`);
  }
  return lines.join('\n');
}

// Remove a transaction by id from file content
export function removeTransactionById(
  content: string,
  id: string
): string {
  const lines = content.split('\n');
  const result: string[] = [];
  let skipping = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.match(/^\d{4}-\d{2}-\d{2}\s+[*!]/)) {
      skipping = line.includes(`id: ${id}`);
    }
    if (!skipping) {
      result.push(line);
    } else if (
      i + 1 < lines.length &&
      lines[i + 1].match(/^\d{4}-\d{2}-\d{2}\s+[*!]/)
    ) {
      skipping = false;
    } else if (i + 1 < lines.length && lines[i + 1].trim() === '') {
      // skip trailing blank line after transaction
      skipping = false;
      continue;
    }
  }

  return result.join('\n');
}

// Parse balance assertions from assert.bean
export function parseBalanceAssertions(content: string): {
  readonly date: string;
  readonly assertions: readonly BalanceAssertion[];
} {
  const assertions: BalanceAssertion[] = [];
  let date = '';

  const lines = content.split('\n');
  for (const line of lines) {
    const match = line.match(
      /^(\d{4}-\d{2}-\d{2})\s+balance\s+(\S+)\s+([-\d,.]+)\s+(\w+)\s*(?:;(.*))?$/
    );
    if (match) {
      if (!date) date = match[1];
      assertions.push({
        account: match[2],
        amount: parseFloat(match[3].replace(/,/g, '')),
        currency: match[4],
        comment: match[5]?.trim() || '',
        raw: line,
      });
    }
  }

  return { date: date || new Date().toISOString().slice(0, 10), assertions };
}

// Generate balance assertions content
export function generateBalanceAssertions(
  date: string,
  assertions: readonly BalanceAssertion[]
): string {
  const lines: string[] = [];
  for (const a of assertions) {
    const amountStr = a.amount.toFixed(2);
    const padding = ' '.repeat(
      Math.max(1, 55 - a.account.length - amountStr.length)
    );
    const commentPart = a.comment ? ` ;${a.comment}` : '';
    lines.push(
      `${date} balance ${a.account}${padding}${amountStr} ${a.currency}${commentPart}`
    );
  }
  return lines.join('\n') + '\n';
}

// Calculate account balances from all transactions
export function calculateBalances(
  transactions: readonly Transaction[]
): AccountBalances {
  let assets = 0;
  let expenses = 0;
  let liabilities = 0;
  let equity = 0;
  let income = 0;

  for (const tx of transactions) {
    for (const p of tx.postings) {
      if (p.account.startsWith('Assets:')) assets += p.amount;
      else if (p.account.startsWith('Expenses:')) expenses += p.amount;
      else if (p.account.startsWith('Liabilities:')) liabilities += p.amount;
      else if (p.account.startsWith('Equity:')) equity += p.amount;
      else if (p.account.startsWith('Income:')) income += p.amount;
    }
  }

  return { assets, expenses, liabilities, equity, income };
}

// Filter transactions by year and month
export function filterByMonth(
  transactions: readonly Transaction[],
  year: number,
  month: number
): readonly Transaction[] {
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  return transactions.filter((tx) => tx.date.startsWith(prefix));
}
