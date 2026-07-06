# 保险内容顾问商业化架构

## 产品边界

第一版聚焦保险经纪人的话题发现和文案编写，不做视频生成。

核心闭环：

```text
经纪人注册/登录
-> 充值 quota
-> 对话框发起内容需求
-> 热榜/搜索/知识库工具调用
-> 生成保险化选题和口播稿
-> 合规审查
-> 扣减 quota
-> 保存草稿/审核记录
```

## 推荐生产组件

- 主应用：Next.js
- 认证：Auth.js
- 数据库：PostgreSQL，AWS RDS
- 缓存：Redis，AWS ElastiCache
- 对象存储：S3
- 额度计量：OpenMeter
- 支付：Stripe；国内版接微信支付/支付宝
- 热榜：DailyHotApi + 搜索 API + 自建缓存
- 模型：OpenAI-compatible chat completions endpoint

## 关键模块

```text
src/app/api/chat            内容 Agent 对话
src/app/api/topics          热榜和保险选题
src/app/api/compliance      合规检测
src/app/api/billing/*       余额、扣量、支付 webhook
src/app/api/drafts          草稿保存
src/lib/agent               保险内容 Agent
src/lib/topics              热榜抓取和保险相关性评分
src/lib/compliance          合规规则
src/lib/billing             quota 定价规则
src/lib/db/repositories     对话、草稿、合规、话题、订单、用量持久化
```

## 数据沉淀

当前已支持在 PostgreSQL 可用时保存：

- conversations：对话会话
- messages：用户输入和助手回复
- drafts：可审核草稿
- compliance_reports：合规风险报告
- usage_logs：quota 消耗流水
- topic_snapshots：热点话题快照
- orders：充值订单

## 下一步生产化改造

1. 注册/登录已经具备服务端 API 和 HttpOnly 会话，下一步可接企业微信/手机号登录。
2. PostgreSQL schema 已在 `migrations/001_initial.sql`，执行 `pnpm db:migrate` 初始化。
3. OpenMeter 适配层已在 `src/lib/billing/openmeter.ts`，配置环境变量后走真实计量。
4. 接支付：Stripe webhook 或微信/支付宝回调，验签后调用 credits grant。
5. 增加机构后台：套餐、用户、额度、审核、合规规则。
6. 增加 AWS IaC：ECS Fargate、RDS、Redis、S3、Secrets Manager、CloudFront。
