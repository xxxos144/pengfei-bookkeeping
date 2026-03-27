import { useState, useEffect, useMemo } from 'react';
import type { Transaction, Posting } from '../types';
import { getInvestments, addInvestment } from '../utils/db';
import { toast } from '../utils/toast';
import './Investments.css';

interface Props {
  readonly onRefresh: () => void;
}

interface InvestmentTemplate {
  readonly name: string;
  readonly assetAccount: string;
  readonly incomeAccount: string;
}

const investTemplates: readonly InvestmentTemplate[] = [
  { name: '零钱通收益', assetAccount: 'Assets:Current:Wechat:MiniFund', incomeAccount: 'Income:Investments' },
  { name: '余额宝收益', assetAccount: 'Assets:Current:Alipay:YuEBao', incomeAccount: 'Income:Investments' },
  { name: '银行利息', assetAccount: 'Assets:Current:Bank:CMB', incomeAccount: 'Income:Interest' },
  { name: '理财收益', assetAccount: 'Assets:Investments:Fund', incomeAccount: 'Income:Investments' },
];

function generateId(): string {
  return 'inv_' + Math.random().toString(36).substring(2, 11);
}

export default function Investments({ onRefresh }: Props) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [records, setRecords] = useState<readonly Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState(0);
  const [date, setDate] = useState(now.toISOString().slice(0, 10));
  const [amount, setAmount] = useState('');
  const [period, setPeriod] = useState(
    `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`
  );

  useEffect(() => {
    getInvestments()
      .then(setRecords)
      .finally(() => setLoading(false));
  }, []);

  const yearRecords = useMemo(
    () => records.filter((r) => r.date.startsWith(String(year))),
    [records, year]
  );

  const handleAdd = async () => {
    const amountNum = parseFloat(amount);
    if (!amount || isNaN(amountNum) || amountNum <= 0) {
      toast('请输入有效金额', 'error');
      return;
    }

    const template = investTemplates[selectedTemplate];
    if (!template) return;

    const postings: Posting[] = [
      { account: template.assetAccount, amount: amountNum, currency: 'CNY' },
      { account: template.incomeAccount, amount: -amountNum, currency: 'CNY' },
    ];

    const tx: Transaction = {
      id: generateId(),
      date,
      flag: '*',
      payee: template.name,
      narration: period,
      postings,
      raw: '',
    };

    await addInvestment(tx);
    const updated = await getInvestments();
    setRecords(updated);
    setAmount('');
    toast('收益已记录', 'success');
    onRefresh();
  };

  if (loading) return <div className="loading">加载中...</div>;

  return (
    <div className="investments">
      <h2 className="page-title">投资收益</h2>

      <div className="invest-form">
        <div className="invest-templates">
          {investTemplates.map((t, i) => (
            <button
              key={t.name}
              className={`invest-tpl-btn ${selectedTemplate === i ? 'active' : ''}`}
              onClick={() => setSelectedTemplate(i)}
            >
              {t.name}
            </button>
          ))}
        </div>
        <div className="invest-fields">
          <div className="form-row">
            <label>日期</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="form-row">
            <label>账期</label>
            <input type="text" placeholder="如：202603" value={period} onChange={(e) => setPeriod(e.target.value)} />
          </div>
          <div className="form-row">
            <label>金额 (CNY)</label>
            <input type="number" step="0.01" min="0" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
          </div>
          <button className="submit-btn" onClick={handleAdd}>记录收益</button>
        </div>
      </div>

      <div className="invest-year-nav">
        <button onClick={() => setYear(year - 1)}>◀</button>
        <span>{year}年</span>
        <button onClick={() => setYear(year + 1)}>▶</button>
      </div>

      <div className="invest-records">
        {yearRecords.length === 0 && <div className="tx-empty">本年暂无记录</div>}
        {yearRecords.map((r) => (
          <div key={r.id} className="invest-card">
            <div className="invest-card-header">
              <span className="invest-date">{r.date}</span>
              <span className="invest-label">{r.payee}</span>
            </div>
            <div className="invest-card-amount">
              +{(r.postings[0]?.amount ?? 0).toFixed(2)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
