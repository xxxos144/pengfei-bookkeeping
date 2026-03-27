import { useState, useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import type { Transaction } from '../types';
import { getTransactionType, filterByMonth } from '../utils/beancount';
import { getAllTransactions, updateTransaction } from '../utils/db';
import { reclassifyTransaction, reassignCategory, ALL_CATEGORIES } from '../utils/categoryRules';
import { toast, toastConfirm } from '../utils/toast';
import './Analytics.css';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

interface Props {
  readonly transactions: readonly Transaction[];
  readonly onRefresh: () => Promise<void>;
}

type SortField = 'amount' | 'name' | 'count';
type SortDir = 'desc' | 'asc';

interface CategoryStat {
  readonly category: string;
  readonly amount: number;
  readonly count: number;
  readonly percent: number;
}

const CATEGORY_COLORS: Record<string, string> = {
  'Food': '#ef4444',
  'Transport': '#f59e0b',
  'Shopping': '#8b5cf6',
  'Daily': '#06b6d4',
  'Entertainment': '#ec4899',
  'Games': '#7c3aed',
  'Online': '#f472b6',
  'Subscription': '#f43f5e',
  'Bills': '#6366f1',
  'Health': '#10b981',
  'Housing': '#f97316',
  'Living': '#14b8a6',
  'Education': '#3b82f6',
  'Transfer': '#9ca3af',
  'Other': '#6b7280',
  'Beauty': '#d946ef',
  'Travel': '#0ea5e9',
  'Sports': '#84cc16',
  'Business': '#a855f7',
  'Communication': '#2dd4bf',
  'Pet': '#fb923c',
  'RedPacket': '#dc2626',
};

function getCategoryColor(cat: string): string {
  for (const [key, color] of Object.entries(CATEGORY_COLORS)) {
    if (cat.includes(key)) return color;
  }
  return '#6b7280';
}

function getCategoryLabel(account: string): string {
  const labels: Record<string, string> = {
    'Expenses:Food:Dining': '餐饮',
    'Expenses:Food': '餐饮',
    'Expenses:Transport': '交通',
    'Expenses:Shopping': '购物',
    'Expenses:Shopping:Clothing': '服饰',
    'Expenses:Shopping:Beauty': '美容',
    'Expenses:Shopping:Electronics': '数码',
    'Expenses:Daily': '日用品',
    'Expenses:Entertainment': '娱乐',
    'Expenses:Entertainment:Games': '游戏',
    'Expenses:Shopping:Online': '网购',
    'Expenses:Subscription': '自动续费',
    'Expenses:Bills': '缴费',
    'Expenses:Health:Medical': '医疗',
    'Expenses:Housing': '住房',
    'Expenses:Housing:Rent': '房租',
    'Expenses:Living': '生活',
    'Expenses:Education': '教育',
    'Expenses:Transfer': '转账',
    'Expenses:RedPacket': '红包',
    'Expenses:Business': '商业',
    'Expenses:Communication': '通讯',
    'Expenses:Travel': '旅游',
    'Expenses:Sports': '运动',
    'Expenses:Pet': '宠物',
    'Expenses:Charity': '公益',
    'Expenses:Other': '其他',
  };
  return labels[account] || account.split(':').slice(-1)[0] || '其他';
}

export default function Analytics({ transactions, onRefresh }: Props) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [sortField, setSortField] = useState<SortField>('amount');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [reclassifying, setReclassifying] = useState(false);

  const handleReclassify = async () => {
    const confirmed = await toastConfirm('一键重新分类将根据关键词规则重新归类所有交易，是否继续？');
    if (!confirmed) return;

    setReclassifying(true);
    try {
      const allTxs = await getAllTransactions();
      let changed = 0;
      for (const tx of allTxs) {
        const updated = reclassifyTransaction(tx);
        if (updated !== tx) {
          await updateTransaction(updated);
          changed++;
        }
      }
      await onRefresh();
      toast(`重新分类完成，${changed} 笔交易已更新`, 'success');
    } catch {
      toast('重新分类失败', 'error');
    } finally {
      setReclassifying(false);
    }
  };

  const handleReassign = async (tx: Transaction, newAccount: string) => {
    const updated = reassignCategory(tx, newAccount);
    await updateTransaction(updated);
    await onRefresh();
    toast('分类已更新', 'success');
  };

  const monthTxs = useMemo(
    () => filterByMonth(transactions, year, month),
    [transactions, year, month]
  );

  // Category breakdown for expenses
  const categoryStats = useMemo(() => {
    const map = new Map<string, { amount: number; count: number }>();
    const txMap = new Map<string, { tx: Transaction; amount: number }[]>();

    for (const tx of monthTxs) {
      const type = getTransactionType(tx);
      if (type !== 'expense' && type !== 'repayment') continue;

      for (const p of tx.postings) {
        if (!p.account.startsWith('Expenses:') && !p.account.startsWith('Liabilities:')) continue;
        if (p.amount <= 0) continue;

        const key = p.account;
        const existing = map.get(key) ?? { amount: 0, count: 0 };
        map.set(key, {
          amount: existing.amount + p.amount,
          count: existing.count + 1,
        });

        const txList = txMap.get(key) ?? [];
        txList.push({ tx, amount: p.amount });
        txMap.set(key, txList);
      }
    }

    const totalExpense = [...map.values()].reduce((s, v) => s + v.amount, 0);

    const stats: CategoryStat[] = [...map.entries()].map(([account, data]) => ({
      category: account,
      amount: data.amount,
      count: data.count,
      percent: totalExpense > 0 ? (data.amount / totalExpense) * 100 : 0,
    }));

    // Sort
    stats.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'amount') cmp = a.amount - b.amount;
      else if (sortField === 'count') cmp = a.count - b.count;
      else cmp = a.category.localeCompare(b.category);
      return sortDir === 'desc' ? -cmp : cmp;
    });

    return { stats, totalExpense, txMap };
  }, [monthTxs, sortField, sortDir]);

  // Daily income/expense line chart data (for the month)
  const chartData = useMemo(() => {
    const daysInMonth = new Date(year, month, 0).getDate();
    const incomeByDay = new Array<number>(daysInMonth).fill(0);
    const expenseByDay = new Array<number>(daysInMonth).fill(0);

    for (const tx of monthTxs) {
      const day = parseInt(tx.date.slice(8, 10), 10);
      if (day < 1 || day > daysInMonth) continue;

      const type = getTransactionType(tx);
      if (type === 'income') {
        for (const p of tx.postings) {
          if (p.account.startsWith('Income:')) incomeByDay[day - 1] += Math.abs(p.amount);
        }
      } else if (type === 'expense') {
        for (const p of tx.postings) {
          if (p.account.startsWith('Expenses:')) expenseByDay[day - 1] += p.amount;
        }
      }
    }

    const labels = Array.from({ length: daysInMonth }, (_, i) => `${i + 1}日`);

    return {
      labels,
      datasets: [
        {
          label: '收入',
          data: incomeByDay,
          borderColor: '#22c55e',
          backgroundColor: 'rgba(34, 197, 94, 0.1)',
          fill: true,
          tension: 0.3,
          pointRadius: 2,
          pointHoverRadius: 5,
        },
        {
          label: '支出',
          data: expenseByDay,
          borderColor: '#ef4444',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          fill: true,
          tension: 0.3,
          pointRadius: 2,
          pointHoverRadius: 5,
        },
      ],
    };
  }, [monthTxs, year, month]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top' as const, labels: { boxWidth: 12, font: { size: 12 } } },
      tooltip: {
        callbacks: {
          label: (ctx: { dataset: { label?: string }; parsed: { y: number | null } }) =>
            `${ctx.dataset.label}: ¥${(ctx.parsed.y ?? 0).toFixed(2)}`,
        },
      },
    },
    scales: {
      x: { ticks: { font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 10 } },
      y: { ticks: { font: { size: 11 }, callback: (v: string | number) => `¥${v}` }, beginAtZero: true },
    },
  };

  const prevMonth = () => {
    if (month === 1) { setYear(year - 1); setMonth(12); }
    else setMonth(month - 1);
  };

  const nextMonth = () => {
    if (month === 12) { setYear(year + 1); setMonth(1); }
    else setMonth(month + 1);
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const sortArrow = (field: SortField) => {
    if (sortField !== field) return '';
    return sortDir === 'desc' ? ' ↓' : ' ↑';
  };

  return (
    <div className="analytics">
      <div className="ledger-nav">
        <button className="nav-btn" onClick={prevMonth}>◀</button>
        <span className="nav-title">{year}年{month}月</span>
        <button className="nav-btn" onClick={nextMonth}>▶</button>
      </div>

      {/* Category Breakdown */}
      <div className="section-card">
        <div className="section-header">
          <h3>支出分类</h3>
          <div className="section-header-right">
            <button
              className="reclassify-btn"
              onClick={handleReclassify}
              disabled={reclassifying}
            >
              {reclassifying ? '分类中...' : '一键重新分类'}
            </button>
            <span className="section-total">
              合计 ¥{categoryStats.totalExpense.toFixed(2)}
            </span>
          </div>
        </div>

        <div className="sort-bar">
          <button
            className={`sort-btn ${sortField === 'amount' ? 'active' : ''}`}
            onClick={() => toggleSort('amount')}
          >
            金额{sortArrow('amount')}
          </button>
          <button
            className={`sort-btn ${sortField === 'count' ? 'active' : ''}`}
            onClick={() => toggleSort('count')}
          >
            笔数{sortArrow('count')}
          </button>
          <button
            className={`sort-btn ${sortField === 'name' ? 'active' : ''}`}
            onClick={() => toggleSort('name')}
          >
            名称{sortArrow('name')}
          </button>
        </div>

        <div className="category-list">
          {categoryStats.stats.length === 0 && (
            <div className="tx-empty">本月暂无支出</div>
          )}
          {categoryStats.stats.map((cat) => {
            const label = getCategoryLabel(cat.category);
            const color = getCategoryColor(cat.category);
            const isExpanded = expanded === cat.category;
            const details = categoryStats.txMap.get(cat.category) ?? [];
            return (
              <div key={cat.category} className="category-group">
                <div
                  className={`category-row clickable ${isExpanded ? 'expanded' : ''}`}
                  onClick={() => setExpanded(isExpanded ? null : cat.category)}
                >
                  <div className="cat-left">
                    <span className={`cat-arrow ${isExpanded ? 'open' : ''}`}>▶</span>
                    <span className="cat-dot" style={{ background: color }} />
                    <span className="cat-name">{label}</span>
                    <span className="cat-count">{cat.count}笔</span>
                  </div>
                  <div className="cat-right">
                    <span className="cat-amount">¥{cat.amount.toFixed(2)}</span>
                    <span className="cat-percent">{cat.percent.toFixed(1)}%</span>
                  </div>
                  <div className="cat-bar-bg">
                    <div
                      className="cat-bar-fill"
                      style={{ width: `${cat.percent}%`, background: color }}
                    />
                  </div>
                </div>
                {isExpanded && details.length > 0 && (
                  <div className="cat-details">
                    {details.map(({ tx, amount }, i) => (
                      <div key={`${tx.id}-${i}`} className="cat-detail-row">
                        <div className="detail-top">
                          <span className="detail-date">{tx.date.slice(5)}</span>
                          <span className="detail-desc">
                            {tx.payee ? `${tx.payee} - ` : ''}{tx.narration}
                          </span>
                          <span className="detail-amount">¥{amount.toFixed(2)}</span>
                        </div>
                        <select
                          className="detail-category-select"
                          value={cat.category}
                          onChange={(e) => handleReassign(tx, e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {ALL_CATEGORIES.map((c) => (
                            <option key={c.account} value={c.account}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Income/Expense Line Chart */}
      <div className="section-card">
        <h3>每日收支趋势</h3>
        <div className="chart-container">
          <Line data={chartData} options={chartOptions} />
        </div>
      </div>
    </div>
  );
}
