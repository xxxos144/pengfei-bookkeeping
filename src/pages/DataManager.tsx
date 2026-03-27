import { useState, useMemo } from 'react';
import type { Transaction } from '../types';
import { clearAllTransactions, importTransactions, deleteTransaction } from '../utils/db';
import { pickBillFiles, importBillFile } from '../utils/billImport';
import { toastConfirm, toast } from '../utils/toast';
import './DataManager.css';

/** Parse "YYYY-MM-DD HH:MM:SS" to epoch seconds */
function toSeconds(time: string | undefined): number | null {
  if (!time) return null;
  const m = time.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):?(\d{2})?/);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0));
  return Math.floor(d.getTime() / 1000);
}

/** Check if two transactions could be the same real-world payment */
function counterpartyCompatible(a: Transaction, b: Transaction): boolean {
  const textA = `${a.payee} ${a.narration}`.toLowerCase();
  const textB = `${b.payee} ${b.narration}`.toLowerCase();
  if (!a.payee && !a.narration) return true;
  if (!b.payee && !b.narration) return true;
  const split = (s: string) => s.replace(/[-_|/，,。.]/g, ' ').split(/\s+/).filter(w => w.length >= 2);
  const wordsA = split(textA);
  const wordsB = split(textB);
  for (const wa of wordsA) {
    for (const wb of wordsB) {
      if (wa.includes(wb) || wb.includes(wa)) return true;
    }
  }
  const generic = /支付宝|微信|财付通|网银在线|银联|云闪付/;
  if (generic.test(textA) || generic.test(textB)) return true;
  return false;
}

/**
 * Find duplicate groups using 3-layer logic:
 * - Layer 2: exact same time (to second) + same amount → definite duplicate
 * - Layer 3: time within ±5 min + same amount + compatible counterparty → likely duplicate
 * - Fallback: no time info → same date + same amount + compatible counterparty
 */
function findDuplicates(txs: readonly Transaction[]): Map<string, Transaction[]> {
  const groups = new Map<string, Transaction[]>();
  const used = new Set<string>();

  for (let i = 0; i < txs.length; i++) {
    if (used.has(txs[i].id)) continue;

    const a = txs[i];
    const aAmt = Math.abs(a.postings[0]?.amount ?? 0).toFixed(2);
    const aSec = toSeconds(a.time);
    const group = [a];

    for (let j = i + 1; j < txs.length; j++) {
      if (used.has(txs[j].id)) continue;
      const b = txs[j];
      const bAmt = Math.abs(b.postings[0]?.amount ?? 0).toFixed(2);
      if (aAmt !== bAmt) continue;

      const bSec = toSeconds(b.time);

      // Both have time
      if (aSec !== null && bSec !== null) {
        // Exact same second = definite duplicate (same-source overlap)
        if (aSec === bSec) {
          group.push(b);
          used.add(b.id);
          continue;
        }
        // Within ±5 minutes + counterparty compatible = cross-source duplicate
        const diffMin = Math.abs(aSec - bSec) / 60;
        if (diffMin <= 5 && counterpartyCompatible(a, b)) {
          group.push(b);
          used.add(b.id);
          continue;
        }
      } else {
        // At least one lacks time: same date + counterparty compatible
        if (a.date === b.date && counterpartyCompatible(a, b)) {
          group.push(b);
          used.add(b.id);
          continue;
        }
      }
    }

    if (group.length > 1) {
      used.add(a.id);
      groups.set(`${a.id}-group`, group);
    }
  }

  return groups;
}

interface Props {
  readonly transactions: readonly Transaction[];
  readonly onImport: () => Promise<void>;
  readonly onExport: () => void;
  readonly onRefresh: () => Promise<void>;
}

export default function DataManager({ transactions, onImport, onExport, onRefresh }: Props) {
  const [clearing, setClearing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [deduping, setDeduping] = useState(false);

  const dupeGroups = useMemo(() => findDuplicates(transactions), [transactions]);
  const dupeCount = useMemo(() => {
    let total = 0;
    for (const list of dupeGroups.values()) {
      total += list.length - 1; // keep 1, count the rest
    }
    return total;
  }, [dupeGroups]);

  const handleDedup = async () => {
    if (dupeCount === 0) {
      toast('没有发现重复交易', 'info');
      return;
    }

    const confirmed = await toastConfirm(
      `发现 ${dupeGroups.size} 组共 ${dupeCount} 笔重复交易（相同金额+时间±5分钟内+交易方一致），确定删除重复项？每组保留信息最详细的一笔。`
    );
    if (!confirmed) return;

    setDeduping(true);
    try {
      let removed = 0;
      for (const list of dupeGroups.values()) {
        // Keep the one with the most detail (longest payee+narration = most info)
        const sorted = [...list].sort((a, b) => {
          const infoA = `${a.payee}${a.narration}${a.time ?? ''}`.length;
          const infoB = `${b.payee}${b.narration}${b.time ?? ''}`.length;
          return infoB - infoA; // descending: most info first
        });
        // Delete all except the most detailed one
        for (let i = 1; i < sorted.length; i++) {
          await deleteTransaction(sorted[i].id);
          removed++;
        }
      }
      await onRefresh();
      toast(`已删除 ${removed} 笔重复交易`, 'success');
    } catch {
      toast('去重失败', 'error');
    } finally {
      setDeduping(false);
    }
  };

  const handleClear = async () => {
    const confirmed = await toastConfirm('确定清空所有交易数据吗？此操作不可撤销！');
    if (!confirmed) return;

    setClearing(true);
    try {
      await clearAllTransactions();
      await onRefresh();
      toast('数据已清空', 'success');
    } finally {
      setClearing(false);
    }
  };

  const handleBillImport = async () => {
    const files = await pickBillFiles();
    if (files.length === 0) return;

    setImporting(true);
    try {
      let totalParsed = 0;
      let totalImported = 0;
      for (const file of files) {
        const txs = await importBillFile(file);
        if (txs.length > 0) {
          const imported = await importTransactions(txs);
          totalParsed += txs.length;
          totalImported += imported;
        }
      }
      if (totalParsed > 0) {
        await onRefresh();
        const skipped = totalParsed - totalImported;
        const msg = skipped > 0
          ? `导入 ${totalImported} 笔，跳过 ${skipped} 笔重复交易`
          : `成功导入 ${totalImported} 笔账单交易`;
        toast(msg, 'success');
      } else {
        toast('未能识别账单内容，请检查文件格式', 'error');
      }
    } catch {
      toast('导入失败，请检查文件', 'error');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="data-manager">
      <h2 className="page-title">数据管理</h2>

      <div className="data-stats">
        <div className="stat-card">
          <span className="stat-number">{transactions.length}</span>
          <span className="stat-label">笔交易</span>
        </div>
        <div className={`stat-card ${dupeCount > 0 ? 'stat-warn' : ''}`}>
          <span className="stat-number">{dupeCount}</span>
          <span className="stat-label">笔重复</span>
        </div>
      </div>

      <div className="data-section data-highlight">
        <h3>导入账单</h3>
        <p>支持支付宝/微信 CSV、银行 PDF、XLSX 格式，自动识别</p>
        <button
          className="data-btn btn-bill"
          onClick={handleBillImport}
          disabled={importing}
        >
          {importing ? '导入中...' : '选择账单文件 (CSV/XLSX/PDF)'}
        </button>
      </div>

      <div className="data-section">
        <h3>导入 Beancount 数据</h3>
        <p>从 .bean 文件导入交易记录</p>
        <button className="data-btn btn-import" onClick={onImport}>
          导入 .bean 文件
        </button>
      </div>

      <div className="data-section">
        <h3>导出数据</h3>
        <p>将所有交易导出为 .bean 格式</p>
        <button className="data-btn btn-export" onClick={onExport}>
          导出 .bean 文件
        </button>
      </div>

      <div className={`data-section ${dupeCount > 0 ? 'data-warn' : ''}`}>
        <h3>去除重复交易</h3>
        <p>
          {dupeCount > 0
            ? `检测到 ${dupeGroups.size} 组共 ${dupeCount} 笔重复交易（相同金额+时间±5分钟+交易方一致），点击去重`
            : '当前没有发现重复交易'}
        </p>
        <button
          className={`data-btn ${dupeCount > 0 ? 'btn-dedup' : 'btn-import'}`}
          onClick={handleDedup}
          disabled={deduping || dupeCount === 0}
        >
          {deduping ? '去重中...' : dupeCount > 0 ? `一键去重（删除 ${dupeCount} 笔）` : '无重复交易'}
        </button>
      </div>

      <div className="data-section data-danger">
        <h3>清空数据</h3>
        <p>删除所有交易记录，此操作不可恢复，请先导出备份</p>
        <button
          className="data-btn btn-danger"
          onClick={handleClear}
          disabled={clearing}
        >
          {clearing ? '清空中...' : '清空所有数据'}
        </button>
      </div>

      <div className="data-section data-info">
        <h3>账单获取方式</h3>
        <ul>
          <li><strong>支付宝</strong>：我的 → 账单 → 右上角 ... → 账单下载 → 邮箱收取</li>
          <li><strong>微信</strong>：我 → 服务 → 钱包 → 账单 → 常见问题 → 下载账单</li>
          <li><strong>银行卡</strong>：手机银行 App 导出交易流水 PDF</li>
          <li>支持 CSV、XLSX、PDF 格式，直接导入</li>
        </ul>
      </div>
    </div>
  );
}
