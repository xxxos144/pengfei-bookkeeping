// Shared keyword-based category classification rules

import type { Transaction } from '../types';

export const KEYWORD_RULES: readonly { pattern: RegExp; account: string }[] = [
  // 交通
  { pattern: /高德打车|滴滴|嘀嘀|出租|打车|曹操出行|T3出行|首汽约车|花小猪|快车|顺风车|地铁|公交|单车|骑行|哈啰/, account: 'Expenses:Transport' },
  // 餐饮
  { pattern: /味千|拉面|餐饮|餐厅|饭店|美团|饿了么|肯德基|麦当劳|星巴克|瑞幸|喜茶|奈雪|海底捞|外卖|小吃|烧烤|火锅|咖啡|奶茶|食堂|便当|快餐/, account: 'Expenses:Food:Dining' },
  // 游戏
  { pattern: /暴雪|网易游戏|腾讯游戏|Steam|steam|游戏充值|米哈游|原神|王者荣耀|和平精英|PlayStation|Xbox|Nintendo|Epic Games/, account: 'Expenses:Entertainment:Games' },
  // 网购
  { pattern: /京东|淘宝|天猫|拼多多|网银在线|唯品会|苏宁|当当|亚马逊|闲鱼|1688|得物/, account: 'Expenses:Shopping:Online' },
  // 自动续费/订阅
  { pattern: /自动续费|连续包月|自动扣款|会员续费|订阅|iCloud|Apple|苹果|Netflix|Spotify|QQ音乐会员|网易云音乐|腾讯视频VIP|优酷VIP|爱奇艺VIP|哔哩哔哩年度|百度网盘|WPS|知乎盐选|微博会员/, account: 'Expenses:Subscription' },
  // 生活缴费
  { pattern: /话费|电费|水费|燃气|物业|宽带|有线/, account: 'Expenses:Bills' },
  // 转账
  { pattern: /转账|微信转账/, account: 'Expenses:Transfer' },
  // 红包
  { pattern: /红包/, account: 'Expenses:RedPacket' },
  // 住房
  { pattern: /房租|租房|自如|蛋壳|贝壳/, account: 'Expenses:Housing:Rent' },
  // 医疗
  { pattern: /医院|药房|药店|诊所|体检/, account: 'Expenses:Health:Medical' },
  // 娱乐
  { pattern: /电影|影院|KTV|ktv|演出|音乐|视频会员|爱奇艺|优酷|腾讯视频|B站|bilibili|网飞/, account: 'Expenses:Entertainment' },
  // 旅游
  { pattern: /机票|酒店|民宿|携程|飞猪|去哪儿|途牛|Airbnb/, account: 'Expenses:Travel' },
  // 运动
  { pattern: /健身|游泳|瑜伽|球场/, account: 'Expenses:Sports' },
];

/** Try to match a text string against keyword rules, return account or null */
export function matchKeywords(text: string): string | null {
  for (const rule of KEYWORD_RULES) {
    if (rule.pattern.test(text)) return rule.account;
  }
  return null;
}

/** All available expense categories for manual selection */
export const ALL_CATEGORIES: readonly { account: string; label: string }[] = [
  { account: 'Expenses:Food:Dining', label: '餐饮' },
  { account: 'Expenses:Transport', label: '交通' },
  { account: 'Expenses:Shopping', label: '购物' },
  { account: 'Expenses:Shopping:Online', label: '网购' },
  { account: 'Expenses:Shopping:Clothing', label: '服饰' },
  { account: 'Expenses:Shopping:Beauty', label: '美容' },
  { account: 'Expenses:Shopping:Electronics', label: '数码' },
  { account: 'Expenses:Daily', label: '日用品' },
  { account: 'Expenses:Entertainment', label: '娱乐' },
  { account: 'Expenses:Entertainment:Games', label: '游戏' },
  { account: 'Expenses:Subscription', label: '自动续费' },
  { account: 'Expenses:Bills', label: '缴费' },
  { account: 'Expenses:Health:Medical', label: '医疗' },
  { account: 'Expenses:Housing', label: '住房' },
  { account: 'Expenses:Housing:Rent', label: '房租' },
  { account: 'Expenses:Living', label: '生活' },
  { account: 'Expenses:Education', label: '教育' },
  { account: 'Expenses:Transfer', label: '转账' },
  { account: 'Expenses:RedPacket', label: '红包' },
  { account: 'Expenses:Business', label: '商业' },
  { account: 'Expenses:Communication', label: '通讯' },
  { account: 'Expenses:Travel', label: '旅游' },
  { account: 'Expenses:Sports', label: '运动' },
  { account: 'Expenses:Pet', label: '宠物' },
  { account: 'Expenses:Charity', label: '公益' },
  { account: 'Expenses:Other', label: '其他' },
];

/**
 * Reclassify a single transaction's expense postings using keyword rules.
 * Returns a new transaction if changed, or the original if no change needed.
 */
export function reclassifyTransaction(tx: Transaction): Transaction {
  const text = `${tx.payee} ${tx.narration}`;
  const matched = matchKeywords(text);
  if (!matched) return tx;

  let changed = false;
  const newPostings = tx.postings.map((p) => {
    if (p.account.startsWith('Expenses:') && p.amount > 0 && p.account !== matched) {
      changed = true;
      return { ...p, account: matched };
    }
    return p;
  });

  return changed ? { ...tx, postings: newPostings } : tx;
}

/**
 * Move a transaction's expense posting to a new category.
 * Returns a new transaction with updated account.
 */
export function reassignCategory(tx: Transaction, newAccount: string): Transaction {
  const newPostings = tx.postings.map((p) => {
    if (p.account.startsWith('Expenses:') && p.amount > 0) {
      return { ...p, account: newAccount };
    }
    return p;
  });
  return { ...tx, postings: newPostings };
}
