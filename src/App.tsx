import { useState, useEffect, useCallback } from 'react';
import Toast from './components/Toast';
import AccountingEquation from './components/AccountingEquation';
import Ledger from './pages/Ledger';
import AddTransaction from './pages/AddTransaction';
import BalanceEditor from './pages/BalanceEditor';
import Investments from './pages/Investments';
import DataManager from './pages/DataManager';
import { getAllTransactions, addTransaction, deleteTransaction, importTransactions } from './utils/db';
import { calculateBalances } from './utils/beancount';
import { importFromBean, exportToBean } from './utils/fileSystem';
import { toast } from './utils/toast';
import type { Transaction, AccountBalances } from './types';
import './App.css';

type Page = 'ledger' | 'add' | 'balance' | 'investments' | 'data';

const pageLabels: Record<Page, string> = {
  ledger: '流水',
  add: '记账',
  balance: '对账',
  investments: '收益',
  data: '数据',
};

const pageIcons: Record<Page, string> = {
  ledger: '📊',
  add: '✏️',
  balance: '⚖️',
  investments: '📈',
  data: '💾',
};

export default function App() {
  const [transactions, setTransactions] = useState<readonly Transaction[]>([]);
  const [balances, setBalances] = useState<AccountBalances>({
    assets: 0, expenses: 0, liabilities: 0, equity: 0, income: 0,
  });
  const [page, setPage] = useState<Page>('ledger');
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    const txs = await getAllTransactions();
    setTransactions(txs);
    setBalances(calculateBalances(txs));
  }, []);

  useEffect(() => {
    loadData().finally(() => setLoading(false));
  }, [loadData]);

  const handleAddTransaction = async (tx: Transaction) => {
    await addTransaction(tx);
    await loadData();
    toast('记账成功！', 'success');
  };

  const handleDeleteTransaction = async (id: string) => {
    await deleteTransaction(id);
    await loadData();
    toast('已删除', 'success');
  };

  const handleImportBean = async () => {
    try {
      const txs = await importFromBean();
      if (txs.length === 0) return;
      await importTransactions(txs);
      await loadData();
      toast(`成功导入 ${txs.length} 笔交易`, 'success');
    } catch {
      toast('导入失败', 'error');
    }
  };

  const handleExportBean = () => {
    if (transactions.length === 0) {
      toast('暂无数据可导出', 'info');
      return;
    }
    exportToBean(transactions, `记账_${new Date().toISOString().slice(0, 10)}.bean`);
    toast('导出成功', 'success');
  };

  if (loading) {
    return (
      <div className="app-loading">
        <div className="spinner" />
        <p>加载中...</p>
      </div>
    );
  }

  return (
    <div className="app">
      <Toast />

      <header className="app-header">
        <h1 className="app-title">记账小工具</h1>
        <span className="app-subtitle">by Oscar</span>
      </header>

      <AccountingEquation balances={balances} />

      <main className="app-main">
        {page === 'ledger' && (
          <Ledger
            transactions={transactions}
            onDelete={handleDeleteTransaction}
          />
        )}
        {page === 'add' && <AddTransaction onAdd={handleAddTransaction} />}
        {page === 'balance' && <BalanceEditor onRefresh={loadData} />}
        {page === 'investments' && <Investments onRefresh={loadData} />}
        {page === 'data' && (
          <DataManager
            transactions={transactions}
            onImport={handleImportBean}
            onExport={handleExportBean}
            onRefresh={loadData}
          />
        )}
      </main>

      <nav className="app-bottom-nav">
        {(Object.keys(pageLabels) as Page[]).map((p) => (
          <button
            key={p}
            className={`bottom-tab ${page === p ? 'active' : ''}`}
            onClick={() => setPage(p)}
          >
            <span className="tab-icon">{pageIcons[p]}</span>
            <span className="tab-label">{pageLabels[p]}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
