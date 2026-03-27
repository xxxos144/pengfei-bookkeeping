import { useState, useMemo } from 'react';
import type { Transaction } from '../types';
import { clearAllTransactions, importTransactions, deleteTransaction } from '../utils/db';
import { pickBillFiles, importBillFile } from '../utils/billImport';
import { toastConfirm, toast } from '../utils/toast';
import './DataManager.css';

/**
 * Build a dedup key from a transaction: date + first posting absolute amount.
 * Same date + same amount = same real-world payment, even if descriptions differ
 * (e.g. Alipay CSV shows "支付宝" while bank PDF shows "中国移动").
 */
function dedupKey(tx: Transaction): string {
  const amount = tx.postings[0]?.amount ?? 0;
  const amtStr = Math.abs(amount).toFixed(2);
  return `${tx.date}|${amtStr}`;
}

/** Find duplicate transaction groups. Returns groups of 2+ with same key. */
function findDuplicates(txs: readonly Transaction[]): Map<string, Transaction[]> {
  const groups = new Map<string, Transaction[]>();
  for (const tx of txs) {
    const key = dedupKey(tx);
    const list = groups.get(key) ?? [];
    list.push(tx);
    groups.set(key, list);
  }
  // Only keep groups with duplicates
  const dupes = new Map<string, Transaction[]>();
  for (const [key, list] of groups) {
    if (list.length > 1) dupes.set(key, list);
  }
  return dupes;
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
      `发现 ${dupeGroups.size} 组共 ${dupeCount} 笔重复交易（相同日期+金额），确定删除重复项？每组只保留一笔。`
    );
    if (!confirmed) return;

    setDeduping(true);
    try {
      let removed = 0;
      for (const list of dupeGroups.values()) {
        // Keep the first one, delete the rest
        for (let i = 1; i < list.length; i++) {
          await deleteTransaction(list[i].id);
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
            ? `检测到 ${dupeGroups.size} 组共 ${dupeCount} 笔重复交易（相同日期+金额），点击去重每组只保留一笔`
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
