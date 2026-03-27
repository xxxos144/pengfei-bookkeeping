import type { AccountBalances } from '../types';
import './AccountingEquation.css';

interface Props {
  readonly balances: AccountBalances;
}

function formatAmount(n: number): string {
  return n.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function AccountingEquation({ balances }: Props) {
  return (
    <div className="equation-bar">
      <div className="equation">
        <span className="eq-item eq-assets">
          资产 <strong>{formatAmount(balances.assets)}</strong>
        </span>
        <span className="eq-op">+</span>
        <span className="eq-item eq-expenses">
          支出 <strong>{formatAmount(balances.expenses)}</strong>
        </span>
        <span className="eq-op">=</span>
        <span className="eq-item eq-liabilities">
          负债 <strong>{formatAmount(Math.abs(balances.liabilities))}</strong>
        </span>
        <span className="eq-op">+</span>
        <span className="eq-item eq-equity">
          权益 <strong>{formatAmount(Math.abs(balances.equity))}</strong>
        </span>
        <span className="eq-op">+</span>
        <span className="eq-item eq-income">
          收入 <strong>{formatAmount(Math.abs(balances.income))}</strong>
        </span>
      </div>
    </div>
  );
}
