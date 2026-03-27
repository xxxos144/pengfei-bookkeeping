import { useState } from 'react';
import type { Transaction } from '../types';
import { clearAllTransactions } from '../utils/db';
import { toastConfirm, toast } from '../utils/toast';
import './DataManager.css';

interface Props {
  readonly transactions: readonly Transaction[];
  readonly onImport: () => Promise<void>;
  readonly onExport: () => void;
  readonly onRefresh: () => Promise<void>;
}

export default function DataManager({ transactions, onImport, onExport, onRefresh }: Props) {
  const [clearing, setClearing] = useState(false);

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

  return (
    <div className="data-manager">
      <h2 className="page-title">数据管理</h2>

      <div className="data-stats">
        <div className="stat-card">
          <span className="stat-number">{transactions.length}</span>
          <span className="stat-label">笔交易</span>
        </div>
      </div>

      <div className="data-section">
        <h3>导入数据</h3>
        <p>从 .bean 文件导入 Beancount 交易记录</p>
        <button className="data-btn btn-import" onClick={onImport}>
          导入 .bean 文件
        </button>
      </div>

      <div className="data-section">
        <h3>导出数据</h3>
        <p>将所有交易导出为 Beancount .bean 格式文件</p>
        <button className="data-btn btn-export" onClick={onExport}>
          导出 .bean 文件
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
        <h3>使用说明</h3>
        <ul>
          <li>所有数据保存在浏览器本地存储中</li>
          <li>支持导入 Beancount (.bean) 格式文件</li>
          <li>导出的文件可用 Fava 或文本编辑器打开</li>
          <li>建议定期导出备份，防止数据丢失</li>
          <li>更换浏览器或清除浏览器数据会丢失记录</li>
        </ul>
      </div>
    </div>
  );
}
