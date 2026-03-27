// Import/Export utilities for .bean files (works on all browsers including mobile)

import type { Transaction } from '../types';
import { parseTransactions, generateTransaction } from './beancount';

// Export transactions to a .bean file (download)
export function exportToBean(
  transactions: readonly Transaction[],
  filename: string = 'ledger.bean'
): void {
  const lines: string[] = [];
  for (const tx of transactions) {
    if (tx.raw) {
      lines.push(tx.raw);
    } else {
      lines.push(
        generateTransaction({
          date: tx.date,
          payee: tx.payee,
          narration: tx.narration,
          postings: tx.postings,
        })
      );
    }
    lines.push('');
  }

  const content = lines.join('\n');
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Import transactions from a .bean file (file picker)
export function importFromBean(): Promise<Transaction[]> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.bean,.beancount,.txt';
    input.multiple = true;

    input.onchange = async () => {
      const files = input.files;
      if (!files || files.length === 0) {
        resolve([]);
        return;
      }

      try {
        const allTx: Transaction[] = [];
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          if (!file) continue;
          const text = await file.text();
          const txs = parseTransactions(text);
          allTx.push(...txs);
        }
        resolve(allTx);
      } catch (err) {
        reject(err);
      }
    };

    input.oncancel = () => resolve([]);
    input.click();
  });
}

// Export data as JSON backup
export function exportAsJSON(data: unknown, filename: string = 'backup.json'): void {
  const content = JSON.stringify(data, null, 2);
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
