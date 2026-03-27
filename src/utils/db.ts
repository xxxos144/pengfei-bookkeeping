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

/**
 * Three-layer dedup strategy (inspired by double-entry-generator community):
 *
 * Layer 1 (import-time ignore): Bank PDF parser skips records where counterparty
 *   is 支付宝/财付通/微信支付 — those are pass-through and already captured
 *   with more detail on the payment tool side.
 *
 * Layer 2 (same-source exact match): If two records have the exact same time
 *   (to the second) + same amount, they're the same record from overlapping
 *   date-range exports of the same source. Definite duplicate.
 *
 * Layer 3 (cross-source fuzzy match): If two records have time within ±5 minutes
 *   + same amount + compatible counterparty, they're likely the same payment
 *   seen from different sources (e.g. WeChat CSV + bank PDF).
 *   Counterparty check prevents false positives (two different purchases
 *   at the same time with the same amount).
 */

/** Parse "YYYY-MM-DD HH:MM:SS" to epoch seconds */
function toSeconds(time: string | undefined): number | null {
  if (!time) return null;
  const m = time.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):?(\d{2})?/);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0));
  return Math.floor(d.getTime() / 1000);
}

/** Check if two counterparty names could refer to the same entity */
function counterpartyCompatible(a: Transaction, b: Transaction): boolean {
  const textA = `${a.payee} ${a.narration}`.toLowerCase();
  const textB = `${b.payee} ${b.narration}`.toLowerCase();
  // If either is empty/generic, treat as compatible (bank PDFs often lack detail)
  if (!a.payee && !a.narration) return true;
  if (!b.payee && !b.narration) return true;

  // Extract meaningful words (2+ chars)
  const split = (s: string) => s.replace(/[-_|/，,。.]/g, ' ').split(/\s+/).filter(w => w.length >= 2);
  const wordsA = split(textA);
  const wordsB = split(textB);

  // Any shared keyword means compatible
  for (const wa of wordsA) {
    for (const wb of wordsB) {
      if (wa.includes(wb) || wb.includes(wa)) return true;
    }
  }

  // If one side is a generic payment channel name, compatible
  // (bank side often just shows "支付宝" with no merchant info)
  const generic = /支付宝|微信|财付通|网银在线|银联|云闪付/;
  if (generic.test(textA) || generic.test(textB)) return true;

  return false;
}

export async function importTransactions(txs: readonly Transaction[]): Promise<number> {
  const db = await getDB();
  const existing = await db.getAll(STORES.transactions);

  // Group existing by date for efficient lookup
  const existingByDate = new Map<string, Transaction[]>();
  for (const t of existing) {
    const list = existingByDate.get(t.date) ?? [];
    list.push(t);
    existingByDate.set(t.date, list);
  }

  function isDuplicate(newTx: Transaction): boolean {
    const newAmt = Math.abs(newTx.postings[0]?.amount ?? 0).toFixed(2);
    const newSec = toSeconds(newTx.time);

    // Check same date and ±1 day (bank may record next-day for late-night tx)
    const datesToCheck = [newTx.date];
    const d = new Date(newTx.date);
    d.setDate(d.getDate() - 1);
    datesToCheck.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 2);
    datesToCheck.push(d.toISOString().slice(0, 10));

    for (const checkDate of datesToCheck) {
      const candidates = existingByDate.get(checkDate) ?? [];
      for (const ex of candidates) {
        const exAmt = Math.abs(ex.postings[0]?.amount ?? 0).toFixed(2);
        if (exAmt !== newAmt) continue;

        const exSec = toSeconds(ex.time);

        // Layer 2: exact same time + same amount = definite duplicate (same-source overlap)
        if (newSec !== null && exSec !== null && newSec === exSec) {
          return true;
        }

        // Layer 3: cross-source fuzzy — within ±5 minutes + counterparty compatible
        if (newSec !== null && exSec !== null) {
          const diffMin = Math.abs(newSec - exSec) / 60;
          if (diffMin > 5) continue; // outside 5-minute window
          if (!counterpartyCompatible(newTx, ex)) continue; // different merchants
          return true;
        }

        // One or both lack precise time: same date + same amount + compatible counterparty
        if (newTx.date === ex.date && counterpartyCompatible(newTx, ex)) {
          return true;
        }
      }
    }
    return false;
  }

  const idbTx = db.transaction(STORES.transactions, 'readwrite');
  let imported = 0;
  for (const t of txs) {
    if (isDuplicate(t)) continue;

    await idbTx.store.put(t);
    // Also add to lookup so batch self-dedup works
    const list = existingByDate.get(t.date) ?? [];
    list.push(t);
    existingByDate.set(t.date, list);
    imported++;
  }
  await idbTx.done;
  return imported;
}

export async function updateTransaction(tx: Transaction): Promise<void> {
  const db = await getDB();
  await db.put(STORES.transactions, tx);
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
