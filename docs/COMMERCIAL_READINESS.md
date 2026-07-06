# 商业化交付清单

系统默认关闭 demo fallback。正式对外销售前，`/api/system/readiness` 必须全部通过。

## 必须配置

- `AUTH_SECRET`：生产随机密钥，不能使用示例值。
- `DATABASE_URL`：生产 PostgreSQL/RDS。
- `MODEL_PROVIDER`、模型 key、`MODEL_NAME`：支持 `groq`、`google`、`openai`/OpenAI-compatible。
- `OPENMETER_BASE_URL`、`OPENMETER_API_KEY`、`OPENMETER_FEATURE_KEY`：quota 查询、扣减和充值发放。
- `STRIPE_SECRET_KEY`、`STRIPE_WEBHOOK_SECRET`：真实支付和 webhook 验签。
- `DAILY_HOT_API_BASE` 或 `SEARCH_API_BASE`：真实话题来源。
- `ENABLE_DEMO_MODE=false`：正式环境必须关闭。

Groq 示例：

```bash
MODEL_PROVIDER=groq
GROQ_API_KEY=...
MODEL_NAME=llama-3.3-70b-versatile
```

Google AI Studio 示例：

```bash
MODEL_PROVIDER=google
GOOGLE_API_KEY=...
MODEL_API_BASE=https://generativelanguage.googleapis.com/v1beta
MODEL_NAME=gemini-2.5-flash
```

## 已收紧的生产行为

- 未登录用户不能访问草稿、话题、对话、合规、账单、用量接口。
- 未配置 OpenMeter 时，不允许生成文案、获取热点或合规检查消耗额度。
- 未配置模型时，不再使用模板文案冒充 AI 输出。
- 未配置话题源时，不再使用本地种子热点冒充真实热榜。
- 生产模式关闭 demo 充值和未验签 webhook。
- 前端不再使用 `localStorage` 保存登录态、草稿、订单或额度。

## 仍需接入真实供应商

- 国内微信/支付宝支付需要单独接入服务商接口，目前生产通道是 Stripe。
- 合规检测目前是规则引擎，建议继续接入 LLM 审核和机构规则库。
- 热榜已支持 DailyHot 风格接口，搜索服务需要按实际供应商补 adapter。
