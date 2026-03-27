#!/usr/bin/env python3
"""
银行 PDF 流水转 CSV 工具
用法: python3 tools/pdf2csv.py 你的银行流水.pdf

会在同目录生成同名的 .csv 文件，可直接导入记账小工具。
"""

import sys
import csv
import os

try:
    import pdfplumber
except ImportError:
    print("请先安装 pdfplumber: pip3 install pdfplumber")
    sys.exit(1)


def extract_transactions(pdf_path: str) -> list[dict]:
    """从银行 PDF 中提取交易记录"""
    transactions = []

    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            tables = page.extract_tables()
            for table in tables:
                if not table:
                    continue

                # Find header row
                header = None
                for row in table:
                    if row and any("记账日期" in (c or "") for c in row):
                        header = [c.strip() if c else "" for c in row]
                        continue
                    if header and row:
                        record = {}
                        for i, cell in enumerate(row):
                            if i < len(header):
                                # Clean up newlines in cell values
                                val = (cell or "").replace("\n", "")
                                record[header[i]] = val.strip()
                        if record.get("记账日期"):
                            transactions.append(record)

    return transactions


def to_csv(transactions: list[dict], output_path: str):
    """将交易记录写入 CSV（支付宝格式兼容）"""
    if not transactions:
        print("未找到交易记录")
        return

    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        # Write header compatible with our import tool
        writer.writerow(
            ["交易时间", "交易分类", "交易对方", "对方账号", "商品说明", "收/支", "金额", "收/付款方式", "交易状态"]
        )

        for tx in transactions:
            date = tx.get("记账日期", "")
            time = tx.get("记账时间", "")
            amount_str = tx.get("金额", "0")
            remark = tx.get("附言", "")
            counterparty = tx.get("对方账户名", "")
            tx_name = tx.get("交易名称", "")

            # Parse amount
            amount_str = amount_str.replace(",", "")
            try:
                amount = float(amount_str)
            except ValueError:
                continue

            # Determine income/expense
            if amount >= 0:
                tx_type = "收入"
                abs_amount = amount
            else:
                tx_type = "支出"
                abs_amount = abs(amount)

            # Clean up counterparty
            counterparty = counterparty.replace("支付宝-", "").replace("财付通-", "")

            # Guess category from remark/counterparty
            category = guess_category(remark, counterparty, tx_name)

            writer.writerow(
                [
                    f"{date} {time}",
                    category,
                    counterparty,
                    tx.get("对方卡号/账号", ""),
                    remark or tx_name,
                    tx_type,
                    f"{abs_amount:.2f}",
                    "中国银行储蓄卡",
                    "交易成功",
                ]
            )

    print(f"已转换 {len(transactions)} 笔交易 -> {output_path}")


def guess_category(remark: str, counterparty: str, tx_name: str) -> str:
    """根据附言和对方名称猜测分类"""
    text = f"{remark}{counterparty}{tx_name}".lower()

    if any(k in text for k in ["地铁", "公交", "滴滴", "出行", "加油"]):
        return "交通出行"
    if any(k in text for k in ["餐", "美团", "饿了么", "食"]):
        return "餐饮美食"
    if any(k in text for k in ["转账", "微信转账"]):
        return "转账"
    if any(k in text for k in ["工资", "薪"]):
        return "工资"
    if any(k in text for k in ["退款", "退"]):
        return "退款"
    if any(k in text for k in ["话费", "电费", "水费", "燃气"]):
        return "充值缴费"
    if any(k in text for k in ["医", "药", "健康"]):
        return "医疗健康"
    return "其他"


def main():
    if len(sys.argv) < 2:
        print("用法: python3 tools/pdf2csv.py <银行流水PDF文件>")
        print("示例: python3 tools/pdf2csv.py 交易流水明细.pdf")
        sys.exit(1)

    pdf_path = sys.argv[1]
    if not os.path.exists(pdf_path):
        print(f"文件不存在: {pdf_path}")
        sys.exit(1)

    output_path = os.path.splitext(pdf_path)[0] + ".csv"

    print(f"正在解析: {pdf_path}")
    transactions = extract_transactions(pdf_path)
    print(f"找到 {len(transactions)} 笔交易")

    to_csv(transactions, output_path)
    print(f"\n转换完成！请在记账小工具的「数据」页面导入: {output_path}")


if __name__ == "__main__":
    main()
