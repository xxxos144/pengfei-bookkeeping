// Parse Alipay and WeChat bill CSV/XLSX files into Transactions

import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import type { Transaction, Posting } from '../types';
import { matchKeywords } from './categoryRules';

// Set up PDF.js worker
GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

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
  const match = s.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (match) {
    return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  }
  return s.trim();
}

/** Extract full datetime string "YYYY-MM-DD HH:MM:SS" from raw date field */
function extractTime(s: string): string {
  if (!s) return '';
  const match = s.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (match) {
    const date = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
    const time = `${match[4].padStart(2, '0')}:${match[5]}:${(match[6] ?? '00').padStart(2, '0')}`;
    return `${date} ${time}`;
  }
  return '';
}

/**
 * Check if a payment method string indicates a bank card payment.
 * Bank card payments from Alipay/WeChat should be skipped when
 * using bank statement as the base — those are already in bank records.
 * Examples: "招商银行储蓄卡(3737)", "工商银行信用卡(1234)", "中国银行(6789)"
 */
function isBankCardPayment(method: string): boolean {
  if (!method) return false;
  return /银行|储蓄卡|信用卡|借记卡|银联/.test(method);
}

// Map category text to Beancount account
function mapExpenseAccount(category: string, desc?: string): string {
  const map: Record<string, string> = {
    '餐饮': 'Expenses:Food:Dining',
    '餐饮美食': 'Expenses:Food:Dining',
    '美食': 'Expenses:Food:Dining',
    '交通': 'Expenses:Transport',
    '交通出行': 'Expenses:Transport',
    '购物': 'Expenses:Shopping',
    '网购': 'Expenses:Shopping:Online',
    '服饰装扮': 'Expenses:Shopping:Clothing',
    '服饰': 'Expenses:Shopping:Clothing',
    '美容美发': 'Expenses:Shopping:Beauty',
    '美容': 'Expenses:Shopping:Beauty',
    '日用百货': 'Expenses:Daily',
    '日用品': 'Expenses:Daily',
    '生活服务': 'Expenses:Living',
    '生活缴费': 'Expenses:Bills',
    '充值缴费': 'Expenses:Bills',
    '通讯': 'Expenses:Communication',
    '医疗健康': 'Expenses:Health:Medical',
    '医疗': 'Expenses:Health:Medical',
    '文化休闲': 'Expenses:Entertainment',
    '休闲娱乐': 'Expenses:Entertainment',
    '娱乐': 'Expenses:Entertainment',
    '教育': 'Expenses:Education',
    '住房': 'Expenses:Housing',
    '房产': 'Expenses:Housing',
    '数码电器': 'Expenses:Shopping:Electronics',
    '电子': 'Expenses:Shopping:Electronics',
    '转账': 'Expenses:Transfer',
    '红包': 'Expenses:RedPacket',
    '商业服务': 'Expenses:Business',
    '酒店旅游': 'Expenses:Travel',
    '旅游': 'Expenses:Travel',
    '运动户外': 'Expenses:Sports',
    '宠物': 'Expenses:Pet',
    '公益': 'Expenses:Charity',
    '其他': 'Expenses:Other',
  };

  // First try category text
  for (const [key, account] of Object.entries(map)) {
    if (category.includes(key)) return account;
  }

  // Fallback: keyword match on category + description
  const text = `${category} ${desc ?? ''}`;
  return matchKeywords(text) ?? 'Expenses:Other';
}

function mapPaymentAccount(method: string): string {
  if (!method) return 'Assets:Current:Unknown';
  if (method.includes('零钱') || method.includes('微信')) return 'Assets:Current:Wechat:Wallet';
  if (method.includes('支付宝') || method.includes('余额')) return 'Assets:Current:Alipay';
  if (method.includes('招商') || method.includes('CMB')) return 'Assets:Current:Bank:CMB';
  if (method.includes('工商') || method.includes('ICBC')) return 'Assets:Current:Bank:ICBC';
  if (method.includes('建设') || method.includes('CCB')) return 'Assets:Current:Bank:CCB';
  if (method.includes('农业') || method.includes('ABC')) return 'Assets:Current:Bank:ABC';
  if (method.includes('中国银行') || method.includes('中行') || method.includes('BOC')) return 'Assets:Current:Bank:BOC';
  if (method.includes('交通银行')) return 'Assets:Current:Bank:BCM';
  if (method.includes('邮储') || method.includes('邮政')) return 'Assets:Current:Bank:PSBC';
  if (method.includes('储蓄卡') || method.includes('借记卡')) return 'Assets:Current:Bank:Other';
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

    const rawDate = (row[dateCol] ?? '').trim();
    const date = normalizeDate(rawDate);
    if (!date) continue;
    const time = extractTime(rawDate);

    const typeStr = typeCol >= 0 ? row[typeCol]?.trim() ?? '' : '';
    const counterparty = (row[counterpartyCol] ?? '').trim();
    const desc = (row[descCol] ?? '').trim();
    const amount = parseAmount(row[amountCol] ?? '');
    const method = (row[methodCol] ?? '').trim();
    const category = categoryCol >= 0 ? row[categoryCol]?.trim() ?? '' : '';

    if (amount <= 0) continue;
    if (typeStr.includes('不计收支')) continue;

    // Skip bank card payments — these are already in bank statement.
    // Only keep Alipay balance/花呗/余额宝 payments.
    if (isBankCardPayment(method)) continue;

    const isIncome = typeStr.includes('收入') || typeStr.includes('入');
    const paymentAccount = mapPaymentAccount(method || '支付宝');

    let postings: Posting[];
    if (isIncome) {
      postings = [
        { account: paymentAccount, amount, currency: 'CNY' },
        { account: 'Income:Other', amount: -amount, currency: 'CNY' },
      ];
    } else {
      const expenseAccount = mapExpenseAccount(category, `${counterparty} ${desc}`);
      postings = [
        { account: expenseAccount, amount, currency: 'CNY' },
        { account: paymentAccount, amount: -amount, currency: 'CNY' },
      ];
    }

    transactions.push({
      id: generateId(),
      date,
      time,
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

    const rawDate = (row[dateCol] ?? '').trim();
    const date = normalizeDate(rawDate);
    if (!date) continue;
    const time = extractTime(rawDate);

    const typeStr = typeCol >= 0 ? row[typeCol]?.trim() ?? '' : '';
    const counterparty = (row[counterpartyCol] ?? '').trim();
    const desc = (row[descCol] ?? '').trim();
    const amount = parseAmount(row[amountCol] ?? '');
    const method = (row[methodCol] ?? '').trim();
    const category = categoryCol >= 0 ? row[categoryCol]?.trim() ?? '' : '';

    if (amount <= 0) continue;

    // Skip bank card payments — these are already in bank statement.
    // Only keep WeChat 零钱/零钱通 payments.
    if (isBankCardPayment(method)) continue;

    const isIncome = typeStr.includes('收入') || typeStr.includes('入');
    const paymentAccount = mapPaymentAccount(method || '微信');

    let postings: Posting[];
    if (isIncome) {
      postings = [
        { account: paymentAccount, amount, currency: 'CNY' },
        { account: 'Income:Other', amount: -amount, currency: 'CNY' },
      ];
    } else {
      const expenseAccount = mapExpenseAccount(category, `${counterparty} ${desc}`);
      postings = [
        { account: expenseAccount, amount, currency: 'CNY' },
        { account: paymentAccount, amount: -amount, currency: 'CNY' },
      ];
    }

    transactions.push({
      id: generateId(),
      date,
      time,
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

// Known header keywords that identify the real data header row
const HEADER_KEYWORDS = ['交易时间', '交易分类', '交易对方', '商品说明', '收/支', '金额', '支付方式', '交易状态', '交易类型', '当前状态'];

// Parse CSV content, skipping leading comment/info lines
function parseCSVContent(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split('\n');

  // Find the header row: look for a line containing known header keywords
  let headerIdx = -1;
  for (let i = 0; i < Math.min(lines.length, 50); i++) {
    const line = lines[i]?.trim() ?? '';
    if (!line) continue;

    // Check if this line contains multiple known header keywords
    const matchCount = HEADER_KEYWORDS.filter((kw) => line.includes(kw)).length;
    if (matchCount >= 3) {
      headerIdx = i;
      break;
    }
  }

  if (headerIdx < 0) {
    // Fallback: find first line with 5+ comma-separated fields that doesn't start with - or #
    for (let i = 0; i < Math.min(lines.length, 50); i++) {
      const line = lines[i]?.trim() ?? '';
      if (!line || line.startsWith('-') || line.startsWith('#')) continue;
      if (line.split(',').length >= 5) {
        headerIdx = i;
        break;
      }
    }
  }

  if (headerIdx < 0) return { headers: [], rows: [] };

  const csvContent = lines.slice(headerIdx).join('\n');
  const result = Papa.parse<string[]>(csvContent, {
    skipEmptyLines: true,
  });

  const data = result.data;
  if (data.length < 2) return { headers: [], rows: [] };

  const headers = data[0]?.map((h) => h.trim()) ?? [];
  // Filter out trailing summary rows (e.g., lines starting with dashes or empty data rows)
  const rows = data.slice(1).filter((r) => {
    if (!r.some((cell) => cell.trim() !== '')) return false;
    const first = r[0]?.trim() ?? '';
    if (first.startsWith('-') || first.startsWith('=')) return false;
    return true;
  });

  return { headers, rows };
}

// Parse bank PDF (e.g., Bank of China transaction statement)
async function parseBankPDF(file: File): Promise<Transaction[]> {
  const buffer = await file.arrayBuffer();
  const pdf = await getDocument({ data: buffer }).promise;

  const allRows: string[][] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();

    // Group text items by Y position (same row)
    const itemsByY = new Map<number, { x: number; str: string }[]>();
    for (const item of textContent.items) {
      if (!('str' in item)) continue;
      const str = item.str.trim();
      if (!str) continue;
      // Round Y to group items on the same line
      const y = Math.round(item.transform[5]);
      if (!itemsByY.has(y)) itemsByY.set(y, []);
      itemsByY.get(y)!.push({ x: item.transform[4], str });
    }

    // Sort rows by Y (descending = top to bottom in PDF)
    const sortedRows = [...itemsByY.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([, items]) =>
        items.sort((a, b) => a.x - b.x).map((it) => it.str)
      );

    allRows.push(...sortedRows);
  }

  // Find header row and parse data
  const BANK_HEADERS = ['记账日期', '金额', '余额', '交易名称', '附言', '对方账户名'];
  let headerIdx = -1;
  let headerCols: string[] = [];

  for (let i = 0; i < allRows.length; i++) {
    const row = allRows[i] ?? [];
    const joined = row.join(' ');
    const matchCount = BANK_HEADERS.filter((h) => joined.includes(h)).length;
    if (matchCount >= 3) {
      headerIdx = i;
      headerCols = row;
      break;
    }
  }

  if (headerIdx < 0) return [];

  const findBankCol = (names: string[]) => {
    for (const name of names) {
      const idx = headerCols.findIndex((h) => h.includes(name));
      if (idx >= 0) return idx;
    }
    return -1;
  };

  const dateCol = findBankCol(['记账日期']);
  const amountCol = findBankCol(['金额']);
  const remarkCol = findBankCol(['附言']);
  const counterpartyCol = findBankCol(['对方账户名']);
  const txNameCol = findBankCol(['交易名称']);

  const transactions: Transaction[] = [];

  for (let i = headerIdx + 1; i < allRows.length; i++) {
    const row = allRows[i] ?? [];
    if (row.length < 3) continue;

    // Check if first cell looks like a date
    const dateStr = row[dateCol] ?? '';
    if (!dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) continue;

    const date = dateStr;
    const amountStr = (row[amountCol] ?? '').replace(/,/g, '');
    const amount = parseFloat(amountStr);
    if (isNaN(amount)) continue;

    const remark = (row[remarkCol] ?? '').replace(/\n/g, '');
    const counterparty = (row[counterpartyCol] ?? '').replace(/\n/g, '');
    const txName = txNameCol >= 0 ? (row[txNameCol] ?? '') : '';

    const absAmount = Math.abs(amount);
    if (absAmount === 0) continue;

    const isIncome = amount > 0;

    // Clean counterparty name
    const cleanCounterparty = counterparty
      .replace(/^支付宝-/, '')
      .replace(/^财付通-/, '');

    // Guess category using shared keyword rules
    const text = `${remark} ${counterparty} ${txName}`;
    let category = matchKeywords(text) ?? 'Expenses:Other';
    if (category === 'Expenses:Other' && /退款|退/.test(text)) {
      category = 'Income:Refund';
    }

    let postings: Posting[];
    if (isIncome) {
      postings = [
        { account: 'Assets:Current:Bank:BOC', amount: absAmount, currency: 'CNY' },
        { account: category.startsWith('Income') ? category : 'Income:Other', amount: -absAmount, currency: 'CNY' },
      ];
    } else {
      postings = [
        { account: category, amount: absAmount, currency: 'CNY' },
        { account: 'Assets:Current:Bank:BOC', amount: -absAmount, currency: 'CNY' },
      ];
    }

    transactions.push({
      id: generateId(),
      date,
      time: '', // bank PDFs typically don't include precise time
      flag: '*',
      payee: cleanCounterparty,
      narration: remark || txName || '银行交易',
      postings,
      raw: '',
    });
  }

  return transactions;
}

// Main entry: import a bill file (CSV, XLSX, or PDF)
export async function importBillFile(file: File): Promise<Transaction[]> {
  const ext = file.name.toLowerCase().split('.').pop();

  let headers: string[];
  let rows: string[][];

  if (ext === 'pdf') {
    return parseBankPDF(file);
  }

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
    // Try both GBK and UTF-8, pick the one that produces valid headers
    const textGBK = await readFileAsGBK(file);
    const textUTF8 = await readFileAsText(file);

    // Try GBK first (Alipay/WeChat CSVs are typically GBK)
    const parsedGBK = parseCSVContent(textGBK);
    const parsedUTF8 = parseCSVContent(textUTF8);

    // Pick the encoding that finds more header keywords
    const gbkScore = HEADER_KEYWORDS.filter((kw) => parsedGBK.headers.join(',').includes(kw)).length;
    const utf8Score = HEADER_KEYWORDS.filter((kw) => parsedUTF8.headers.join(',').includes(kw)).length;

    const parsed = gbkScore >= utf8Score ? parsedGBK : parsedUTF8;
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
    input.accept = '.csv,.xlsx,.xls,.pdf';
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
