---
name: my-holdings
description: 读取当前会话用户的 Mentora Deal 模拟账户持仓、数量、成本、估值与资金；复用 portfolio-account，只读，不下单。
---

# 我的持仓

需要“我的持仓”、监控已有标的、个人看板或结合个人数据分析时，先调用此 Skill 读取已有数据；不能未读取就要求用户手工列出代码或声称没有权限。持仓与自选是不同的数据源，按问题组合两者；不把自选当持仓。身份由已认证的会话服务注入，不接受 owner、Cookie 或账号参数。

```
python3 app/skill_runner.py contract --script read_my_holdings.py
python3 app/skill_runner.py execute --script read_my_holdings.py
```

脚本不需要参数。输出包含 resource、asOf、source、mode 以及 account（含 positions）。持仓来自 Mentora 模拟账户，不是外部券商或 AInvest 实盘账户；这是当前读取时间的快照，不保证每项估值行情实时更新，保留账户中原有时间与失效标记。读取失败必须报告真实错误，不能当成空列表。读取成功且为空时才说明空仓/自选为空，并按需要询问补充。不要请求用户提供 Cookie、密钥或身份，不执行 refresh、交易或自选变更。
