import { useState, useMemo } from 'react';
import type { Transaction, TransactionType } from '../types';
import {
  getTransactionType,
  getTransactionColor,
  filterByMonth,
} from '../utils/beancount';
import { toastConfirm } from '../utils/toast';
import './Ledger.css';

interface Props {
  readonly transactions: readonly Transaction[];
  readonly onDelete: (id: string) => Promise<void>;
}

const typeLabelsMap: Record<string, string> = {
  expense: '支出',
  income: '收入',
  transfer: '转账',
  repayment: '还款',
};

type Filter = 'all' | 'income' | 'expense';

export default function Ledger({ transactions, onDelete }: Props) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [filter, setFilter] = useState<Filter>('all');

  const monthTxs = useMemo(
    () => filterByMonth(transactions, year, month),
    [transactions, year, month]
  );

  const monthTotal = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const tx of monthTxs) {
      const type = getTransactionType(tx);
      if (type === 'expense') {
        for (const p of tx.postings) {
          if (p.account.startsWith('Expenses:')) expense += p.amount;
        }
      } else if (type === 'income') {
        for (const p of tx.postings) {
          if (p.account.startsWith('Income:')) income += Math.abs(p.amount);
        }
      }
    }
    return { income, expense };
  }, [monthTxs]);

  // Apply type filter
  const filtered = useMemo(() => {
    if (filter === 'all') return monthTxs;
    return monthTxs.filter((tx) => {
      const type: TransactionType = getTransactionType(tx);
      if (filter === 'income') return type === 'income';
      if (filter === 'expense') return type === 'expense' || type === 'repayment';
      return true;
    });
  }, [monthTxs, filter]);

  const prevMonth = () => {
    if (month === 1) { setYear(year - 1); setMonth(12); }
    else setMonth(month - 1);
  };

  const nextMonth = () => {
    if (month === 12) { setYear(year + 1); setMonth(1); }
    else setMonth(month + 1);
  };

  const toggleFilter = (f: Filter) => {
    setFilter(filter === f ? 'all' : f);
  };

  const handleDelete = async (tx: Transaction) => {
    const confirmed = await toastConfirm(`确定删除「${tx.narration}」吗？`);
    if (!confirmed) return;
    await onDelete(tx.id);
  };

  return (
    <div className="ledger">
      <div className="ledger-nav">
        <button className="nav-btn" onClick={prevMonth}>◀</button>
        <span className="nav-title">{year}年{month}月</span>
        <button className="nav-btn" onClick={nextMonth}>▶</button>
      </div>

      <div className="month-summary">
        <div
          className={`summary-item summary-income clickable ${filter === 'income' ? 'active' : ''}`}
          onClick={() => toggleFilter('income')}
        >
          收入<strong>¥{monthTotal.income.toFixed(2)}</strong>
        </div>
        <div
          className={`summary-item summary-expense clickable ${filter === 'expense' ? 'active' : ''}`}
          onClick={() => toggleFilter('expense')}
        >
          支出<strong>¥{monthTotal.expense.toFixed(2)}</strong>
        </div>
        <div className="summary-item summary-balance">
          结余<strong>¥{(monthTotal.income - monthTotal.expense).toFixed(2)}</strong>
        </div>
      </div>

      {filter !== 'all' && (
        <div className="filter-hint">
          当前筛选：{filter === 'income' ? '仅收入' : '仅支出'}
          <button className="filter-clear" onClick={() => setFilter('all')}>显示全部</button>
        </div>
      )}

      <div className="tx-list">
        {filtered.length === 0 && (
          <div className="tx-empty">
            {filter !== 'all' ? '没有符合筛选条件的记录' : '本月暂无交易记录'}
          </div>
        )}
        {[...filtered].reverse().map((tx) => {
          const type = getTransactionType(tx);
          const colorClass = getTransactionColor(type);
          const mainAmount = tx.postings[0]?.amount ?? 0;

          return (
            <div key={tx.id} className={`tx-card ${colorClass}`}>
              <div className="tx-header">
                <span className="tx-date">{tx.date}</span>
                <span className="tx-type-badge">{typeLabelsMap[type]}</span>
              </div>
              <div className="tx-body">
                <div className="tx-info">
                  {tx.payee && <span className="tx-payee">{tx.payee}</span>}
                  <span className="tx-narration">{tx.narration}</span>
                </div>
                <span className="tx-amount">
                  {mainAmount >= 0 ? '+' : ''}{mainAmount.toFixed(2)}
                </span>
              </div>
              <div className="tx-footer">
                <div className="tx-accounts">
                  {tx.postings.map((p, i) => (
                    <span key={i} className="tx-account">
                      {p.account.split(':').slice(-1)[0]}
                    </span>
                  ))}
                </div>
                <button
                  className="tx-delete"
                  onClick={() => handleDelete(tx)}
                >
                  删除
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
