// Transaction templates for quick entry

import type { TransactionTemplate } from '../types';

export const expenseTemplates: readonly TransactionTemplate[] = [
  {
    name: '餐饮',
    type: 'expense',
    payee: '',
    narration: '餐饮',
    debitAccount: 'Expenses:Food:Dining',
    creditAccount: 'Assets:Current:Wechat:Wallet',
  },
  {
    name: '交通',
    type: 'expense',
    payee: '',
    narration: '交通出行',
    debitAccount: 'Expenses:Transport',
    creditAccount: 'Assets:Current:Wechat:Wallet',
  },
  {
    name: '购物',
    type: 'expense',
    payee: '',
    narration: '购物',
    debitAccount: 'Expenses:Shopping',
    creditAccount: 'Assets:Current:Wechat:Wallet',
  },
  {
    name: '日用品',
    type: 'expense',
    payee: '',
    narration: '日用品',
    debitAccount: 'Expenses:Daily',
    creditAccount: 'Assets:Current:Wechat:Wallet',
  },
  {
    name: '娱乐',
    type: 'expense',
    payee: '',
    narration: '娱乐',
    debitAccount: 'Expenses:Entertainment',
    creditAccount: 'Assets:Current:Wechat:Wallet',
  },
  {
    name: '医疗',
    type: 'expense',
    payee: '',
    narration: '医疗',
    debitAccount: 'Expenses:Health:Medical',
    creditAccount: 'Assets:Current:Wechat:Wallet',
  },
  {
    name: '通讯',
    type: 'expense',
    payee: '',
    narration: '通讯费',
    debitAccount: 'Expenses:Communication',
    creditAccount: 'Assets:Current:Wechat:Wallet',
  },
  {
    name: '网购',
    type: 'expense',
    payee: '',
    narration: '网购',
    debitAccount: 'Expenses:Shopping:Online',
    creditAccount: 'Assets:Current:Wechat:Wallet',
  },
  {
    name: '游戏',
    type: 'expense',
    payee: '',
    narration: '游戏充值',
    debitAccount: 'Expenses:Entertainment:Games',
    creditAccount: 'Assets:Current:Wechat:Wallet',
  },
  {
    name: '房租',
    type: 'expense',
    payee: '',
    narration: '房租',
    debitAccount: 'Expenses:Housing:Rent',
    creditAccount: 'Assets:Current:Bank:CMB',
  },
];

export const incomeTemplates: readonly TransactionTemplate[] = [
  {
    name: '工资',
    type: 'income',
    payee: '',
    narration: '月工资',
    debitAccount: 'Assets:Current:Bank:CMB',
    creditAccount: 'Income:Salary',
  },
  {
    name: '公积金',
    type: 'income',
    payee: '',
    narration: '住房公积金',
    debitAccount: 'Assets:Current:Bank:HousingFund',
    creditAccount: 'Income:HousingFund',
  },
  {
    name: '年终奖',
    type: 'income',
    payee: '',
    narration: '年终奖',
    debitAccount: 'Assets:Current:Bank:CMB',
    creditAccount: 'Income:Bonus',
  },
  {
    name: '红包',
    type: 'income',
    payee: '',
    narration: '红包',
    debitAccount: 'Assets:Current:Wechat:Wallet',
    creditAccount: 'Income:RedPacket',
  },
];

export const transferTemplates: readonly TransactionTemplate[] = [
  {
    name: '微信转账',
    type: 'transfer',
    payee: '',
    narration: '微信转银行卡',
    debitAccount: 'Assets:Current:Bank:CMB',
    creditAccount: 'Assets:Current:Wechat:Wallet',
  },
  {
    name: '支付宝转账',
    type: 'transfer',
    payee: '',
    narration: '支付宝转银行卡',
    debitAccount: 'Assets:Current:Bank:CMB',
    creditAccount: 'Assets:Current:Alipay',
  },
  {
    name: '零钱通转入',
    type: 'transfer',
    payee: '',
    narration: '转入零钱通',
    debitAccount: 'Assets:Current:Wechat:MiniFund',
    creditAccount: 'Assets:Current:Wechat:Wallet',
  },
];

export const repaymentTemplates: readonly TransactionTemplate[] = [
  {
    name: '信用卡还款',
    type: 'repayment',
    payee: '',
    narration: '信用卡还款',
    debitAccount: 'Liabilities:CreditCard:CMB',
    creditAccount: 'Assets:Current:Bank:CMB',
  },
  {
    name: '京东白条',
    type: 'repayment',
    payee: '',
    narration: '京东白条还款',
    debitAccount: 'Liabilities:JDBaitiao',
    creditAccount: 'Assets:Current:Bank:CMB',
  },
  {
    name: '花呗还款',
    type: 'repayment',
    payee: '',
    narration: '花呗还款',
    debitAccount: 'Liabilities:Huabei',
    creditAccount: 'Assets:Current:Alipay',
  },
];

export const allTemplates: Record<string, readonly TransactionTemplate[]> = {
  expense: expenseTemplates,
  income: incomeTemplates,
  transfer: transferTemplates,
  repayment: repaymentTemplates,
};
