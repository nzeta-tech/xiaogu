# 小谷

面向保险经纪人的话题发现与短视频文案智能体。当前版本已收紧为商业化优先模式：默认关闭 demo fallback，核心功能必须登录、必须配置真实模型、真实计量计费和真实支付通道。

## 本地运行

```bash
cp .env.example .env
corepack pnpm install --registry=https://registry.npmmirror.com
corepack pnpm dev
```

本地演示如需使用内置模板、固定额度和 demo 支付，可在 `.env` 中显式设置：

```bash
ENABLE_DEMO_MODE=true
```

访问：

```text
http://localhost:3000
```

## 数据库迁移

本地或服务器配置好 `DATABASE_URL` 后执行：

```bash
corepack pnpm db:migrate
```

Docker 环境：

```bash
docker compose up postgres redis -d
docker compose run --rm migrate
docker compose up app
```

## 当前能力

- 服务端注册/登录 API、bcrypt 密码、HttpOnly 会话
- 经纪人内容顾问对话框
- 今日热点选题工具，生产模式要求配置热榜/搜索来源
- 保险化角度生成
- 视频号/抖音口播稿生成，生产模式要求配置 OpenAI-compatible 模型
- 合规风险提示
- OpenMeter quota 查询、消耗上报和 credits 发放入口
- 充值套餐和 Stripe Checkout 支付入口
- Stripe webhook 验签后订单置为 paid 并发放 credits
- PostgreSQL 生产 schema 和迁移脚本
- 对话、草稿、合规报告、用量、话题快照、订单持久化
- Docker 和 AWS 部署文档

## 商业化必配环境变量

```bash
ENABLE_DEMO_MODE=false
MODEL_PROVIDER=groq
GROQ_API_KEY=...
MODEL_NAME=llama-3.3-70b-versatile
OPENMETER_BASE_URL=...
OPENMETER_API_KEY=...
OPENMETER_FEATURE_KEY=ai_content_generation
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...
DAILY_HOT_API_BASE=...
DATABASE_URL=...
AUTH_SECRET=...
```

也可以使用 Google AI Studio：

```bash
MODEL_PROVIDER=google
GOOGLE_API_KEY=...
MODEL_NAME=gemini-2.5-flash
```

## 生产化方向

详见：

- `docs/ARCHITECTURE.md`
- `docs/BILLING.md`
- `docs/AWS_DEPLOYMENT.md`
- `docs/COMMERCIAL_READINESS.md`
