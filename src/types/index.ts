// Beancount transaction types

export interface Posting {
  readonly account: string;
  readonly amount: number;
  readonly currency: string;
}

export interface Transaction {
  readonly id: string;
  readonly date: string;
  /** Full datetime string for dedup, e.g. "2026-03-10 12:30:45". Empty if unknown. */
  readonly time?: string;
  readonly flag: string;
  readonly payee: string;
  readonly narration: string;
  readonly postings: readonly Posting[];
  readonly raw: string;
}

export type TransactionType = 'expense' | 'income' | 'transfer' | 'repayment';

export interface TransactionTemplate {
  readonly name: string;
  readonly type: TransactionType;
  readonly payee: string;
  readonly narration: string;
  readonly debitAccount: string;
  readonly creditAccount: string;
}

export interface BalanceAssertion {
  readonly account: string;
  readonly amount: number;
  readonly currency: string;
  readonly comment: string;
  readonly raw: string;
}

export interface InvestmentRecord {
  readonly date: string;
  readonly payee: string;
  readonly narration: string;
  readonly assetAccount: string;
  readonly incomeAccount: string;
  readonly amount: number;
  readonly currency: string;
  readonly raw: string;
}

export interface AccountBalances {
  readonly assets: number;
  readonly expenses: number;
  readonly liabilities: number;
  readonly equity: number;
  readonly income: number;
}

export type ToastType = 'info' | 'success' | 'error' | 'confirm';

export interface ToastMessage {
  readonly id: string;
  readonly message: string;
  readonly type: ToastType;
  readonly onConfirm?: () => void;
  readonly onCancel?: () => void;
}
