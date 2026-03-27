import { useState, useEffect } from 'react';
import type { BalanceAssertion } from '../types';
import { getBalanceAssertions, saveBalanceAssertions } from '../utils/db';
import { toast } from '../utils/toast';
import './BalanceEditor.css';

interface Props {
  readonly onRefresh: () => void;
}

export default function BalanceEditor({ onRefresh }: Props) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [assertions, setAssertions] = useState<BalanceAssertion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getBalanceAssertions()
      .then(({ date: d, assertions: a }) => {
        setDate(d);
        setAssertions([...a]);
      })
      .finally(() => setLoading(false));
  }, []);

  const updateAmount = (index: number, value: string) => {
    const num = parseFloat(value);
    if (isNaN(num)) return;
    setAssertions((prev) => {
      const updated = [...prev];
      const item = updated[index];
      if (!item) return prev;
      const isLiability = item.account.startsWith('Liabilities:');
      updated[index] = { ...item, amount: isLiability ? -Math.abs(num) : num };
      return updated;
    });
  };

  const handleSave = async () => {
    await saveBalanceAssertions(date, assertions);
    toast('余额已保存', 'success');
    onRefresh();
  };

  const addAssertion = () => {
    setAssertions((prev) => [
      ...prev,
      { account: 'Assets:Current:', amount: 0, currency: 'CNY', comment: '', raw: '' },
    ]);
  };

  const removeAssertion = (index: number) => {
    setAssertions((prev) => prev.filter((_, i) => i !== index));
  };

  if (loading) return <div className="loading">加载中...</div>;

  return (
    <div className="balance-editor">
      <h2 className="page-title">余额对账</h2>
      <p className="page-desc">记录各账户的实际余额</p>

      <div className="assert-date-row">
        <label>对账日期</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      <div className="assert-list">
        {assertions.map((a, i) => {
          const isLiability = a.account.startsWith('Liabilities:');
          return (
            <div key={i} className={`assert-row ${isLiability ? 'liability' : 'asset'}`}>
              <div className="assert-account">
                <input
                  type="text"
                  value={a.account}
                  placeholder="账户名称"
                  onChange={(e) => {
                    setAssertions((prev) => {
                      const updated = [...prev];
                      updated[i] = { ...a, account: e.target.value };
                      return updated;
                    });
                  }}
                />
              </div>
              <div className="assert-amount">
                {isLiability && <span className="liability-sign">-</span>}
                <input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  value={Math.abs(a.amount).toFixed(2)}
                  onChange={(e) => updateAmount(i, e.target.value)}
                />
                <button className="assert-remove" onClick={() => removeAssertion(i)}>✕</button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="assert-actions">
        <button className="btn-add" onClick={addAssertion}>+ 添加账户</button>
        <button className="btn-save" onClick={handleSave}>保存</button>
      </div>
    </div>
  );
}
