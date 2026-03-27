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

const ACCOUNT_LABELS: Record<string, string> = {
  'Assets:Current:Alipay': '支付宝余额',
  'Assets:Current:Wechat:Wallet': '微信零钱',
  'Assets:Current:Wechat:MiniFund': '零钱通',
  'Assets:Current:Bank:CMB': '招商银行',
  'Assets:Current:Bank:BOC': '中国银行',
  'Assets:Current:Bank:ICBC': '工商银行',
  'Assets:Current:Bank:CCB': '建设银行',
  'Assets:Current:Bank:ABC': '农业银行',
  'Assets:Current:Bank:BOCM': '交通银行',
  'Assets:Current:Bank:CIB': '兴业银行',
  'Assets:Current:Bank:SPDB': '浦发银行',
  'Assets:Current:Bank:CMBC': '民生银行',
  'Assets:Current:Bank:HousingFund': '住房公积金',
  'Assets:Current:Unknown': '未知账户',
  'Liabilities:CreditCard:CMB': '招行信用卡',
  'Liabilities:Huabei': '花呗',
  'Liabilities:JDBaitiao': '京东白条',
};

function accountLabel(account: string): string {
  if (ACCOUNT_LABELS[account]) return ACCOUNT_LABELS[account];
  // Friendly fallback: join last 2 segments
  const parts = account.split(':');
  return parts.slice(-2).join(' · ');
}

function formatTime(time: string | undefined): string {
  if (!time) return '';
  // "2026-03-10 14:35:22" → "14:35"
  const m = time.match(/\d{2}:\d{2}/);
  return m ? m[0] : '';
}

export default function Ledger({ transactions, onDelete }: Props) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [filter, setFilter] = useState<Filter>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
          const isExpanded = expandedId === tx.id;
          const timeStr = formatTime(tx.time);

          return (
            <div key={tx.id} className={`tx-card ${colorClass}`}>
              {/* Clickable main area */}
              <div
                className="tx-clickable-area"
                onClick={() => setExpandedId(isExpanded ? null : tx.id)}
              >
                <div className="tx-header">
                  <span className="tx-date">
                    {tx.date}{timeStr ? ` ${timeStr}` : ''}
                  </span>
                  <div className="tx-header-right">
                    <span className="tx-type-badge">{typeLabelsMap[type]}</span>
                    <span className={`tx-expand-arrow ${isExpanded ? 'open' : ''}`}>›</span>
                  </div>
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
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="tx-detail">
                  {tx.time && (
                    <div className="tx-detail-row">
                      <span className="tx-detail-label">交易时间</span>
                      <span className="tx-detail-value">{tx.time.slice(0, 16)}</span>
                    </div>
                  )}
                  {tx.postings.map((p, i) => (
                    <div key={i} className="tx-detail-row">
                      <span className="tx-detail-label">
                        {i === 0 ? '支出账户' : '对方账户'}
                      </span>
                      <span className="tx-detail-value">
                        {accountLabel(p.account)}
                        <em className="tx-detail-amount">
                          {p.amount >= 0 ? '+' : ''}{p.amount.toFixed(2)}
                        </em>
                      </span>
                    </div>
                  ))}
                  <div className="tx-detail-footer">
                    <button
                      className="tx-delete"
                      onClick={(e) => { e.stopPropagation(); handleDelete(tx); }}
                    >
                      删除
                    </button>
                  </div>
                </div>
              )}

              {/* Footer only when collapsed */}
              {!isExpanded && (
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
                    onClick={(e) => { e.stopPropagation(); handleDelete(tx); }}
                  >
                    删除
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
