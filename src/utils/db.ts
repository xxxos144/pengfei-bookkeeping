// IndexedDB storage for all app data (mobile-compatible, no File System Access API needed)

import { openDB, type IDBPDatabase } from 'idb';
import type { Transaction, BalanceAssertion } from '../types';

const DB_NAME = 'pengfei-bookkeeping';
const DB_VERSION = 2;

const STORES = {
  transactions: 'transactions',
  balanceAssertions: 'balance-assertions',
  investments: 'investments',
  settings: 'settings',
} as const;

function getDB(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORES.transactions)) {
        db.createObjectStore(STORES.transactions, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.balanceAssertions)) {
        db.createObjectStore(STORES.balanceAssertions, { keyPath: 'account' });
      }
      if (!db.objectStoreNames.contains(STORES.investments)) {
        db.createObjectStore(STORES.investments, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.settings)) {
        db.createObjectStore(STORES.settings);
      }
    },
  });
}

// === Transactions ===

export async function getAllTransactions(): Promise<Transaction[]> {
  const db = await getDB();
  const txs = await db.getAll(STORES.transactions);
  return txs.sort((a: Transaction, b: Transaction) => a.date.localeCompare(b.date));
}

export async function addTransaction(tx: Transaction): Promise<void> {
  const db = await getDB();
  await db.put(STORES.transactions, tx);
}

export async function deleteTransaction(id: string): Promise<void> {
  const db = await getDB();
  await db.delete(STORES.transactions, id);
}

export async function importTransactions(txs: readonly Transaction[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(STORES.transactions, 'readwrite');
  for (const t of txs) {
    await tx.store.put(t);
  }
  await tx.done;
}

export async function clearAllTransactions(): Promise<void> {
  const db = await getDB();
  await db.clear(STORES.transactions);
}

// === Balance Assertions ===

export async function getBalanceAssertions(): Promise<{
  date: string;
  assertions: BalanceAssertion[];
}> {
  const db = await getDB();
  const assertions = await db.getAll(STORES.balanceAssertions);
  const date = (await db.get(STORES.settings, 'assertDate')) || new Date().toISOString().slice(0, 10);
  return { date, assertions };
}

export async function saveBalanceAssertions(
  date: string,
  assertions: readonly BalanceAssertion[]
): Promise<void> {
  const db = await getDB();
  await db.put(STORES.settings, date, 'assertDate');
  const tx = db.transaction(STORES.balanceAssertions, 'readwrite');
  await tx.store.clear();
  for (const a of assertions) {
    await tx.store.put(a);
  }
  await tx.done;
}

// === Investments ===

export async function getInvestments(): Promise<Transaction[]> {
  const db = await getDB();
  const txs = await db.getAll(STORES.investments);
  return txs.sort((a: Transaction, b: Transaction) => a.date.localeCompare(b.date));
}

export async function addInvestment(tx: Transaction): Promise<void> {
  const db = await getDB();
  await db.put(STORES.investments, tx);
}

// === Settings ===

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDB();
  return (await db.get(STORES.settings, key)) ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDB();
  await db.put(STORES.settings, value, key);
}
