import { useState } from 'react';
import type { Transaction, TransactionType, Posting } from '../types';
import { allTemplates } from '../utils/templates';
import './AddTransaction.css';

interface Props {
  readonly onAdd: (tx: Transaction) => Promise<void>;
}

const typeLabels: Record<TransactionType, string> = {
  expense: '支出',
  income: '收入',
  transfer: '转账',
  repayment: '还款',
};

function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}

export default function AddTransaction({ onAdd }: Props) {
  const [txType, setTxType] = useState<TransactionType>('expense');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [payee, setPayee] = useState('');
  const [narration, setNarration] = useState('');
  const [debitAccount, setDebitAccount] = useState('');
  const [creditAccount, setCreditAccount] = useState('');
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const templates = allTemplates[txType] ?? [];

  const applyTemplate = (index: number) => {
    const t = templates[index];
    if (!t) return;
    setPayee(t.payee);
    setNarration(t.narration);
    setDebitAccount(t.debitAccount);
    setCreditAccount(t.creditAccount);
  };

  const handleSubmit = async () => {
    if (!date || !narration || !debitAccount || !creditAccount || !amount) return;
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) return;

    setSubmitting(true);
    try {
      const postings: Posting[] = [
        { account: debitAccount, amount: amountNum, currency: 'CNY' },
        { account: creditAccount, amount: -amountNum, currency: 'CNY' },
      ];

      const tx: Transaction = {
        id: generateId(),
        date,
        flag: '*',
        payee,
        narration,
        postings,
        raw: '',
      };

      await onAdd(tx);
      setPayee('');
      setNarration('');
      setAmount('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="add-tx">
      <h2 className="page-title">记一笔</h2>

      <div className="type-selector">
        {(Object.keys(typeLabels) as TransactionType[]).map((t) => (
          <button
            key={t}
            className={`type-btn ${txType === t ? 'active' : ''} type-${t}`}
            onClick={() => setTxType(t)}
          >
            {typeLabels[t]}
          </button>
        ))}
      </div>

      <div className="template-list">
        {templates.map((t, i) => (
          <button key={t.name} className="template-btn" onClick={() => applyTemplate(i)}>
            {t.name}
          </button>
        ))}
      </div>

      <div className="tx-form">
        <div className="form-row">
          <label>日期</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="form-row">
          <label>交易对象</label>
          <input type="text" placeholder="如：美团、公司名称" value={payee} onChange={(e) => setPayee(e.target.value)} />
        </div>
        <div className="form-row">
          <label>备注</label>
          <input type="text" placeholder="如：午餐、三月工资" value={narration} onChange={(e) => setNarration(e.target.value)} />
        </div>
        <div className="form-row">
          <label>金额 (CNY)</label>
          <input type="number" step="0.01" min="0" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
        </div>
        <div className="form-row">
          <label>{txType === 'expense' ? '支出科目' : '借方科目'}</label>
          <input type="text" placeholder="如：Expenses:Food:Dining" value={debitAccount} onChange={(e) => setDebitAccount(e.target.value)} />
        </div>
        <div className="form-row">
          <label>{txType === 'expense' ? '付款账户' : '贷方科目'}</label>
          <input type="text" placeholder="如：Assets:Current:Wechat:Wallet" value={creditAccount} onChange={(e) => setCreditAccount(e.target.value)} />
        </div>

        <button className="submit-btn" onClick={handleSubmit} disabled={submitting}>
          {submitting ? '保存中...' : '确认记账'}
        </button>
      </div>
    </div>
  );
}
