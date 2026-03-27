// Parse Alipay and WeChat bill CSV/XLSX files into Transactions

import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import type { Transaction, Posting } from '../types';

function generateId(): string {
  return 'imp_' + Math.random().toString(36).substring(2, 11);
}

// Detect bill source from headers
type BillSource = 'alipay' | 'wechat' | 'unknown';

function detectSource(headers: readonly string[]): BillSource {
  const joined = headers.join(',');
  if (joined.includes('交易号') || joined.includes('商家订单号') || joined.includes('支付宝')) {
    return 'alipay';
  }
  if (joined.includes('微信支付') || joined.includes('交易单号') || joined.includes('当前状态')) {
    return 'wechat';
  }
  return 'unknown';
}

// Normalize amount string to number
function parseAmount(s: string): number {
  if (!s) return 0;
  const cleaned = s.replace(/[¥￥,\s]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : Math.abs(num);
}

// Normalize date string
function normalizeDate(s: string): string {
  if (!s) return '';
  // Handle "2026-03-10 12:30:45" or "2026/03/10 12:30:45"
  const match = s.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (match) {
    return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  }
  return s.trim();
}

// Map category text to Beancount account
function mapExpenseAccount(category: string): string {
  const map: Record<string, string> = {
    '餐饮': 'Expenses:Food:Dining',
    '餐饮美食': 'Expenses:Food:Dining',
    '美食': 'Expenses:Food:Dining',
    '交通': 'Expenses:Transport',
    '交通出行': 'Expenses:Transport',
    '购物': 'Expenses:Shopping',
    '服饰装扮': 'Expenses:Shopping:Clothing',
    '日用百货': 'Expenses:Daily',
    '生活服务': 'Expenses:Living',
    '充值缴费': 'Expenses:Bills',
    '通讯': 'Expenses:Communication',
    '医疗健康': 'Expenses:Health:Medical',
    '文化休闲': 'Expenses:Entertainment',
    '娱乐': 'Expenses:Entertainment',
    '教育': 'Expenses:Education',
    '住房': 'Expenses:Housing',
    '数码电器': 'Expenses:Shopping:Electronics',
    '转账': 'Expenses:Transfer',
    '红包': 'Expenses:RedPacket',
    '商业服务': 'Expenses:Business',
  };

  for (const [key, account] of Object.entries(map)) {
    if (category.includes(key)) return account;
  }
  return 'Expenses:Other';
}

function mapPaymentAccount(method: string): string {
  if (!method) return 'Assets:Current:Unknown';
  if (method.includes('零钱') || method.includes('微信')) return 'Assets:Current:Wechat:Wallet';
  if (method.includes('支付宝') || method.includes('余额')) return 'Assets:Current:Alipay';
  if (method.includes('招商') || method.includes('CMB')) return 'Assets:Current:Bank:CMB';
  if (method.includes('工商') || method.includes('ICBC')) return 'Assets:Current:Bank:ICBC';
  if (method.includes('建设') || method.includes('CCB')) return 'Assets:Current:Bank:CCB';
  if (method.includes('农业') || method.includes('ABC')) return 'Assets:Current:Bank:ABC';
  if (method.includes('花呗')) return 'Liabilities:Huabei';
  if (method.includes('信用卡')) return 'Liabilities:CreditCard';
  if (method.includes('白条')) return 'Liabilities:JDBaitiao';
  if (method.includes('零钱通')) return 'Assets:Current:Wechat:MiniFund';
  if (method.includes('余额宝')) return 'Assets:Current:Alipay:YuEBao';
  return 'Assets:Current:Bank:Other';
}

// Find column index by possible header names
function findCol(headers: readonly string[], names: readonly string[]): number {
  for (const name of names) {
    const idx = headers.findIndex((h) => h.trim().includes(name));
    if (idx >= 0) return idx;
  }
  return -1;
}

// Parse Alipay CSV rows
function parseAlipayRows(headers: readonly string[], rows: readonly string[][]): Transaction[] {
  const dateCol = findCol(headers, ['交易时间', '交易创建时间', '付款时间']);
  const typeCol = findCol(headers, ['收/支', '资金状态']);
  const counterpartyCol = findCol(headers, ['交易对方', '对方']);
  const descCol = findCol(headers, ['商品说明', '商品名称', '备注']);
  const amountCol = findCol(headers, ['金额', '金额（元）', '交易金额']);
  const methodCol = findCol(headers, ['收/付款方式', '支付方式']);
  const categoryCol = findCol(headers, ['交易分类', '类别']);
  const statusCol = findCol(headers, ['交易状态', '资金状态']);

  const transactions: Transaction[] = [];

  for (const row of rows) {
    if (row.length < 3) continue;

    const status = statusCol >= 0 ? row[statusCol]?.trim() ?? '' : '';
    // Skip closed/refunded transactions
    if (status.includes('关闭') || status.includes('退款')) continue;

    const date = normalizeDate(row[dateCol] ?? '');
    if (!date) continue;

    const typeStr = typeCol >= 0 ? row[typeCol]?.trim() ?? '' : '';
    const counterparty = (row[counterpartyCol] ?? '').trim();
    const desc = (row[descCol] ?? '').trim();
    const amount = parseAmount(row[amountCol] ?? '');
    const method = (row[methodCol] ?? '').trim();
    const category = categoryCol >= 0 ? row[categoryCol]?.trim() ?? '' : '';

    if (amount <= 0) continue;

    const isIncome = typeStr.includes('收入') || typeStr.includes('入');
    const paymentAccount = mapPaymentAccount(method || '支付宝');

    let postings: Posting[];
    if (isIncome) {
      postings = [
        { account: paymentAccount, amount, currency: 'CNY' },
        { account: 'Income:Other', amount: -amount, currency: 'CNY' },
      ];
    } else {
      const expenseAccount = mapExpenseAccount(category || desc);
      postings = [
        { account: expenseAccount, amount, currency: 'CNY' },
        { account: paymentAccount, amount: -amount, currency: 'CNY' },
      ];
    }

    transactions.push({
      id: generateId(),
      date,
      flag: '*',
      payee: counterparty,
      narration: desc || category || '支付宝交易',
      postings,
      raw: '',
    });
  }

  return transactions;
}

// Parse WeChat CSV rows
function parseWechatRows(headers: readonly string[], rows: readonly string[][]): Transaction[] {
  const dateCol = findCol(headers, ['交易时间']);
  const typeCol = findCol(headers, ['收/支']);
  const counterpartyCol = findCol(headers, ['交易对方']);
  const descCol = findCol(headers, ['商品', '商品说明']);
  const amountCol = findCol(headers, ['金额(元)', '金额', '金额（元）']);
  const methodCol = findCol(headers, ['支付方式']);
  const statusCol = findCol(headers, ['当前状态', '交易状态']);
  const categoryCol = findCol(headers, ['交易类型']);

  const transactions: Transaction[] = [];

  for (const row of rows) {
    if (row.length < 3) continue;

    const status = statusCol >= 0 ? row[statusCol]?.trim() ?? '' : '';
    if (status.includes('已退款') || status.includes('已关闭') || status.includes('对方已退还')) continue;

    const date = normalizeDate(row[dateCol] ?? '');
    if (!date) continue;

    const typeStr = typeCol >= 0 ? row[typeCol]?.trim() ?? '' : '';
    const counterparty = (row[counterpartyCol] ?? '').trim();
    const desc = (row[descCol] ?? '').trim();
    const amount = parseAmount(row[amountCol] ?? '');
    const method = (row[methodCol] ?? '').trim();
    const category = categoryCol >= 0 ? row[categoryCol]?.trim() ?? '' : '';

    if (amount <= 0) continue;

    const isIncome = typeStr.includes('收入') || typeStr.includes('入');
    const paymentAccount = mapPaymentAccount(method || '微信');

    let postings: Posting[];
    if (isIncome) {
      postings = [
        { account: paymentAccount, amount, currency: 'CNY' },
        { account: 'Income:Other', amount: -amount, currency: 'CNY' },
      ];
    } else {
      const expenseAccount = mapExpenseAccount(category || desc);
      postings = [
        { account: expenseAccount, amount, currency: 'CNY' },
        { account: paymentAccount, amount: -amount, currency: 'CNY' },
      ];
    }

    transactions.push({
      id: generateId(),
      date,
      flag: '*',
      payee: counterparty,
      narration: desc || category || '微信支付',
      postings,
      raw: '',
    });
  }

  return transactions;
}

// Parse generic CSV/XLSX rows (try best guess)
function parseGenericRows(headers: readonly string[], rows: readonly string[][]): Transaction[] {
  const dateCol = findCol(headers, ['日期', 'date', '交易时间', '时间']);
  const descCol = findCol(headers, ['描述', '备注', '说明', '摘要', 'description', 'memo']);
  const amountCol = findCol(headers, ['金额', 'amount', '交易金额']);

  if (dateCol < 0 || amountCol < 0) return [];

  const transactions: Transaction[] = [];

  for (const row of rows) {
    const date = normalizeDate(row[dateCol] ?? '');
    if (!date) continue;

    const desc = descCol >= 0 ? (row[descCol] ?? '').trim() : '';
    const amountRaw = row[amountCol] ?? '';
    const amount = parseAmount(amountRaw);
    if (amount <= 0) continue;

    const isNegative = amountRaw.trim().startsWith('-');

    let postings: Posting[];
    if (isNegative) {
      postings = [
        { account: 'Expenses:Other', amount, currency: 'CNY' },
        { account: 'Assets:Current:Unknown', amount: -amount, currency: 'CNY' },
      ];
    } else {
      postings = [
        { account: 'Assets:Current:Unknown', amount, currency: 'CNY' },
        { account: 'Income:Other', amount: -amount, currency: 'CNY' },
      ];
    }

    transactions.push({
      id: generateId(),
      date,
      flag: '*',
      payee: '',
      narration: desc || '导入交易',
      postings,
      raw: '',
    });
  }

  return transactions;
}

// Read file as text, handling different encodings
function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    // Try UTF-8 first; Alipay/WeChat CSVs are usually GBK or UTF-8
    reader.readAsText(file, 'UTF-8');
  });
}

function readFileAsGBK(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file, 'GBK');
  });
}

// Parse CSV content, skipping leading comment lines
function parseCSVContent(text: string): { headers: string[]; rows: string[][] } {
  // Alipay/WeChat CSVs often have comment lines at the top
  const lines = text.split('\n');
  let startIdx = 0;
  for (let i = 0; i < Math.min(lines.length, 30); i++) {
    const line = lines[i]?.trim() ?? '';
    // Skip empty lines and lines that look like headers/comments
    if (line.startsWith('#') || line.startsWith('-') || line === '') {
      startIdx = i + 1;
      continue;
    }
    // If this line has enough commas, it might be the header
    if (line.split(',').length >= 3) {
      startIdx = i;
      break;
    }
    startIdx = i + 1;
  }

  const csvContent = lines.slice(startIdx).join('\n');
  const result = Papa.parse<string[]>(csvContent, {
    skipEmptyLines: true,
  });

  const data = result.data;
  if (data.length < 2) return { headers: [], rows: [] };

  const headers = data[0]?.map((h) => h.trim()) ?? [];
  const rows = data.slice(1).filter((r) => r.some((cell) => cell.trim() !== ''));

  return { headers, rows };
}

// Main entry: import a bill file (CSV or XLSX)
export async function importBillFile(file: File): Promise<Transaction[]> {
  const ext = file.name.toLowerCase().split('.').pop();

  let headers: string[];
  let rows: string[][];

  if (ext === 'xlsx' || ext === 'xls') {
    // Read XLSX
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return [];
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return [];

    const jsonData = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false });
    if (jsonData.length < 2) return [];

    // Skip leading comment rows (same logic as CSV)
    let startIdx = 0;
    for (let i = 0; i < Math.min(jsonData.length, 30); i++) {
      const row = jsonData[i];
      if (!row || row.length < 3 || row.every((c) => !c || c.trim() === '')) {
        startIdx = i + 1;
        continue;
      }
      // Check if this looks like a data header (has known column names)
      const joined = row.join(',');
      if (joined.includes('交易') || joined.includes('金额') || joined.includes('日期')) {
        startIdx = i;
        break;
      }
    }

    headers = (jsonData[startIdx] ?? []).map((h) => (h ?? '').toString().trim());
    rows = jsonData.slice(startIdx + 1).map((r) => r.map((c) => (c ?? '').toString()));
  } else {
    // Read CSV - try UTF-8 first, then GBK
    let text = await readFileAsText(file);
    // If we see garbled Chinese, try GBK
    if (text.includes('ï¿½') || text.includes('é') || text.includes('å')) {
      text = await readFileAsGBK(file);
    }
    const parsed = parseCSVContent(text);
    headers = parsed.headers;
    rows = parsed.rows;
  }

  if (headers.length === 0) return [];

  const source = detectSource(headers);

  switch (source) {
    case 'alipay':
      return parseAlipayRows(headers, rows);
    case 'wechat':
      return parseWechatRows(headers, rows);
    default:
      return parseGenericRows(headers, rows);
  }
}

// Pick and import bill files
export function pickBillFiles(): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,.xlsx,.xls';
    input.multiple = true;
    input.onchange = () => {
      const files = input.files;
      if (!files || files.length === 0) {
        resolve([]);
        return;
      }
      resolve(Array.from(files));
    };
    input.oncancel = () => resolve([]);
    input.click();
  });
}
