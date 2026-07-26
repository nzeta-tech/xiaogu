# 小谷支付能力完善需求（交给 Multica 数字员工）

## 1. 需求背景

请参考 Codex 工作区中的 `llm-api-router` 项目，重点参考以下能力：

- 管理员后台「系统设置 → 支付设置」
- 支付服务商实例管理
- 多支付渠道统一抽象
- 订单状态机、回调验签、幂等处理和超时对账
- 管理员支付订单、支付统计和退款/补偿能力

将上述成熟方案以适合小谷现有架构的方式移植到本项目，完善小谷的支付能力。不要简单复制 `llm-api-router` 的 Go/Vue 代码；必须适配小谷当前的 Next.js、TypeScript、PostgreSQL、Session、OpenMeter 和管理员设置体系。

参考实现：

- `../../llm-api-router/docs/PAYMENT.md`
- `../../llm-api-router/docs/ADMIN_PAYMENT_INTEGRATION_API.md`
- `../../llm-api-router/frontend/src/components/payment/providerConfig.ts`
- `../../llm-api-router/frontend/src/views/admin/SettingsView.vue` 中的 Provider Management
- `../../llm-api-router/backend/internal/handler/admin/payment_handler.go`

## 2. 当前小谷能力与迁移约束

改造前先完整盘点并复用现有实现：

- 套餐：`billing_plans`
- 订单：`orders`
- 积分发放：`src/lib/billing/openmeter.ts`
- 用户余额、消费和额度限制
- 优惠码/折扣
- 分销返利
- 管理员系统设置：`system_settings`、`src/lib/system/settings.ts`、`/api/admin/settings`
- 现有 Stripe Checkout 和 `/api/billing/webhook`
- 现有账单页、订单列表和管理员后台

不得破坏以下现有行为：套餐购买、优惠码核销、支付成功后积分到账、OpenMeter 事件幂等、分销返利、演示模式和现有环境变量部署方式。

## 3. 总体目标

完成后，小谷应具备：

1. 管理员可以在后台启用/停用支付，并配置支付规则。
2. 管理员可以创建、编辑、启用、停用和排序多个支付服务商实例。
3. 前台只展示统一的支付方式名称，不直接暴露服务商品牌；后台负责将支付方式路由到具体实例。
4. 新增支付渠道时，不需要修改订单核心逻辑，只需实现统一 Provider 接口和对应回调处理。
5. 所有支付回调都必须验签、幂等、可重试，并能处理“已支付但积分未到账”。
6. 管理员可以查询订单、筛选异常订单、查看支付统计，并对失败到账和退款进行受控处理。

## 4. 支付服务商模型

新增支付服务商实例模型。建议新增 `payment_provider_instances` 表，至少包含：

- `id`
- `name`：管理员可读名称
- `provider_key`：`stripe`、`airwallex`、`easypay`、`alipay`、`wxpay`
- `enabled`
- `sort_order`
- `supported_methods`：该实例支持的统一支付方式
- `config_encrypted`：敏感配置整体加密存储，禁止明文落库和 API 返回
- `min_amount_cents`
- `max_amount_cents`
- `daily_limit_cents`
- `daily_used_amount_cents` 或可由订单聚合得到
- `refund_enabled`
- `created_at`、`updated_at`
- 最近健康检查、最近回调时间和最近错误信息（可选，但建议提供）

实例选择必须过滤：未启用、支付方式不匹配、金额超出实例范围、达到日限额的实例。支持至少两种策略：

- Round Robin：按排序和轮询分配
- Least Amount：优先选择当日累计金额较低的实例

同一统一支付方式默认只允许一个有效路由；如果产品确实需要多实例容灾，应由后台明确配置优先级和 fallback，不能由前端随机选择。

### 4.1 服务商类型和配置字段

按 `llm-api-router` 的配置体验实现动态配置表单，但根据小谷实际接入优先级分阶段完成。

#### Stripe

- Secret Key
- Publishable Key
- Webhook Secret
- Currency
- API/Checkout 模式（如需要）

优先复用小谷现有 Stripe 实现，将环境变量作为兼容 fallback；后台配置优先级高于环境变量。发布给前端的只能是 Publishable Key，Secret Key 和 Webhook Secret 必须脱敏。

#### Airwallex

- Client ID
- API Key
- Webhook Secret
- API Base URL
- Country Code
- Currency
- Account ID（可选）

#### EasyPay

- PID
- PKey
- API Base URL
- Alipay Channel ID（可选）
- WeChat Channel ID（可选）

#### 支付宝官方

- App ID
- RSA2 Private Key
- Alipay Public Key

支持桌面扫码优先、网页支付 fallback，以及移动端跳转/唤起能力，具体以 SDK 和商户资质实际支持范围为准。

#### 微信支付官方

- App ID
- Merchant ID
- Merchant API Private Key
- APIv3 Key
- Certificate Serial Number
- WeChat Pay Public Key
- WeChat Pay Public Key ID

支持 Native QR、H5，以及在微信环境下的 JSAPI/小程序支付（如果小谷具备对应用户场景和资质）。

### 4.2 统一前台支付方式

前台统一展示：

- Stripe/银行卡或国际支付
- 支付宝
- 微信支付

不要把 `EasyPay`、某个商户名或某个聚合平台名称直接展示给用户。后台将“支付宝”路由到支付宝官方或 EasyPay，将“微信支付”路由到微信官方或 EasyPay。未配置有效路由时，前台不展示该方式。

## 5. 管理员「支付设置」

在现有管理员系统设置中新增或完善支付设置页，至少包含：

### 基础设置

- 启用支付
- 产品名称前缀/后缀
- 最低单笔支付金额
- 最高单笔支付金额；空值表示不限制
- 单用户每日支付累计上限；空值表示不限制
- 订单超时分钟数，最小 1 分钟，默认 30 分钟
- 单用户最大待支付订单数，默认 3
- 服务商选择策略：Round Robin / Least Amount
- 是否展示套餐购买
- 支付页面提示文案
- 客服二维码/帮助图片

### 前台支付方式路由

- 支付宝：启用开关 + 目标服务商实例
- 微信支付：启用开关 + 目标服务商实例
- Stripe：启用开关 + 目标服务商实例
- Airwallex：启用开关 + 目标服务商实例
- 手工转账：保留现有能力，但必须进入“待人工审核”流程，不得直接给用户加积分

### 取消频率限制

参考 `llm-api-router` 增加：

- 是否启用
- 滑动窗口/固定窗口
- 时间窗口和单位
- 窗口内最大取消次数

### 保存和安全要求

- 后台保存设置必须通过现有管理员鉴权、TOTP（如已启用）和审计日志。
- 敏感字段编辑时显示脱敏值；留空表示保持原值，提供明确的“清除”操作。
- 不允许通过 GET、日志、错误堆栈、前端状态或普通管理员接口泄露密钥。
- 修改服务商配置后，不影响历史订单使用的服务商快照。
- 支付设置和服务商配置变更后清理缓存/刷新运行时配置。

## 6. 订单和数据库改造

在保留 `orders` 兼容性的前提下完善字段，建议至少增加：

- `provider_instance_id`
- `payment_method`
- `status`：`pending`、`paid`、`completed`、`expired`、`cancelled`、`failed`、`refund_requested`、`refunding`、`refunded`
- `paid_at`、`completed_at`、`expired_at`、`cancelled_at`、`refunded_at`
- `failure_code`、`failure_message`
- `idempotency_key`
- `callback_event_id` 或独立 webhook 事件表
- `amount_cents`、`base_amount_cents`、`fee_cents`、`currency` 的最终金额快照
- `metadata` 中保存套餐、折扣、渠道上下文，但不得保存完整密钥

建议新增 `payment_webhook_events` 表，按 `provider_key + event_id` 唯一约束，保存：原始事件摘要、验签结果、处理状态、处理次数、最后错误、收到时间和处理时间。

订单创建必须在服务端重新校验套餐、金额、折扣、用户限制、支付设置和服务商可用性，不能信任前端传入的金额或积分数量。

## 7. 统一 Provider 接口

抽象出类似以下能力，命名可按小谷代码风格调整：

```ts
interface PaymentProvider {
  createPayment(input: CreatePaymentInput): Promise<PaymentCheckoutResult>;
  verifyWebhook(input: VerifyWebhookInput): Promise<VerifiedPaymentEvent>;
  queryPayment?(input: QueryPaymentInput): Promise<PaymentStatus>;
  refund?(input: RefundPaymentInput): Promise<RefundResult>;
  healthCheck?(): Promise<ProviderHealthResult>;
}
```

要求：

- Provider 只负责和外部支付平台交互，不直接修改用户积分。
- 订单状态变更、积分到账、分销返利由统一业务服务处理。
- 创建支付失败要将订单标记为 `failed` 并释放优惠权益。
- 同一个支付成功事件重复到达时不得重复加积分或重复返利。
- 支付金额、币种、订单号、用户和套餐必须与本地订单一致，否则拒绝处理并记录异常。

## 8. 支付流程

### 创建订单

1. 用户选择套餐和支付方式。
2. 服务端加载支付设置和可用服务商实例。
3. 过期旧订单，并释放相关优惠权益。
4. 校验待支付数量、金额范围、每日金额上限和套餐额度范围。
5. 选择服务商实例并保存实例快照。
6. 创建 `pending` 订单，生成服务端幂等键。
7. 调用 Provider 创建支付请求。
8. 保存第三方订单号和 checkout URL/二维码/H5 参数。
9. 返回前端展示所需的最小支付信息。

### 回调和到账

1. 接收支付平台回调。
2. 先验签，再按 provider + event id 做 webhook 幂等判断。
3. 校验第三方订单号、金额、币种和商户实例。
4. 将订单从 `pending` 更新为 `paid`。
5. 通过现有 OpenMeter/积分服务发放额度，使用订单号或事件号作为幂等键。
6. 积分成功到账后更新为 `completed`，再执行分销返利。
7. 如果支付成功但积分到账失败，订单保持 `paid` 或进入 `failed`，管理员可重试，不得要求用户重复付款。

### 超时和对账

- 后台任务每 60 秒检查超时订单。
- 标记 `expired` 前先查询上游支付状态；已支付但回调延迟的订单必须补处理。
- 回调失败、查询失败、积分到账失败都要保留可追踪错误信息。
- 管理员可手工重试“支付成功但未到账”的订单，重试必须幂等。

## 9. 手工转账

小谷已有 `enableManualTransfer` 字段时，完善为真正可运营的流程：

- 用户创建手工转账订单，状态为 `pending_manual_review` 或等价状态。
- 展示收款说明、金额、订单号和帮助二维码。
- 用户提交付款凭证时保存附件引用，不保存无必要的敏感信息。
- 管理员审核通过后，先记录审核人、审核时间和备注，再走统一积分发放服务。
- 审核拒绝必须填写原因。
- 审核和补发都必须幂等并写入审计日志。
- 手工转账不得通过未认证的公开 webhook 直接加积分。

## 10. 管理员订单和运营页面

在现有管理员后台增加支付运营能力：

- 订单列表：用户、订单号、套餐、金额、币种、支付方式、服务商实例、状态、创建/支付/完成时间
- 筛选：时间、状态、支付方式、服务商、用户、订单号
- 订单详情：状态时间线、第三方订单号、事件记录、失败原因、折扣、积分到账结果
- 对 `paid`/`failed` 订单执行积分到账重试
- 对符合条件的订单发起退款；退款前二次确认，退款结果异步更新
- 手工转账审核
- 支付统计：收入、订单数、成功率、失败数、退款金额、按日趋势、按支付方式和服务商分布
- 服务商健康状态、最近回调时间和最近错误

所有人工操作都要记录管理员、目标订单、操作前后状态、原因和时间。

## 11. API 要求

API 路径按小谷现有约定设计，至少需要：

- 用户侧获取支付配置/可用方式
- 用户侧创建订单
- 用户侧查询订单和支付状态
- 各 Provider 独立 webhook endpoint
- 管理员读取/更新支付设置
- 管理员增删改查、启停、排序服务商实例
- 管理员订单列表、详情、重试到账、退款、手工转账审核
- 管理员支付统计和服务商健康检查

公开接口只能返回前端必要字段；服务商配置接口必须按字段脱敏，禁止把 `config_encrypted` 原样返回。

## 12. 实施优先级

### P0：先完成支付基础设施

- 统一 Provider 接口
- 服务商实例数据模型和加密存储
- 支付设置与前台支付方式路由
- 订单状态机和 webhook 事件幂等
- 将现有 Stripe 从环境变量直接耦合迁移到 Provider，同时保留环境变量 fallback
- 补齐“支付成功/积分到账”分离和到账重试

### P1：接入运营闭环

- 管理员订单列表、详情、统计
- 手工转账审核
- 订单超时上游查询和后台对账
- 退款流程
- 服务商健康检查和配置校验

### P2：增加支付渠道

按实际商户资质、地区和合规要求选择：

1. Airwallex
2. EasyPay
3. 支付宝官方
4. 微信支付官方

不要为了“接口齐全”而在没有商户资质、沙箱账号和验签测试数据时宣称渠道已完成。

## 13. 测试和验收标准

### 自动化测试

- Provider 配置字段、脱敏和加密测试
- 订单金额/积分/币种校验测试
- 服务商实例筛选、排序和负载均衡测试
- webhook 签名错误、重复事件、金额不匹配、未知订单测试
- 支付成功重复回调不会重复加积分/返利
- 支付成功但积分失败可重试
- 超时订单上游已支付时可以自动恢复
- 管理员权限、TOTP、审计日志测试
- 手工转账审核通过/拒绝/重复审核测试
- 退款和退款失败测试

### 验收场景

1. 仅配置 Stripe：现有购买流程完全可用。
2. Stripe 关闭：前台不展示 Stripe，创建接口拒绝请求。
3. 配置两个 Stripe 实例：按策略分配，达到实例限额后自动跳过。
4. 配置支付宝/微信但未选路由：前台不展示对应方式。
5. 同一个 webhook 重放 10 次：只能产生一次积分到账和一次返利。
6. webhook 已验签但积分服务临时失败：订单可在管理员后台重试，用户无需再次支付。
7. 订单超过超时时间但上游已支付：对账任务将订单恢复并完成积分到账。
8. 任何普通用户都不能读取服务商密钥；管理员日志中也不能出现完整密钥。
9. 数据库迁移后现有订单、套餐、优惠码、积分和环境变量配置不丢失。
10. 前台、后台、回调接口均有清晰的错误提示和可追踪 request/order/event id。

## 14. 交付要求

请按以下顺序交付，不要只提交 UI：

1. 先输出改造设计和数据库迁移方案，确认与现有小谷代码的兼容性。
2. 完成 P0 并补齐自动化测试。
3. 完成 P1 管理后台和运维能力。
4. 根据可用商户账号逐个接入 P2 渠道。
5. 更新部署环境变量、回调 URL 配置说明、管理员使用说明和故障排查文档。
6. 执行构建、数据库迁移、单元测试、接口测试和真实/沙箱支付回调验证。
7. 最终报告必须列出：已完成渠道、未完成渠道、需要管理员配置的密钥、回调 URL、已知限制和回滚方式。

## 15. 重要边界

- 不复制或提交任何真实支付密钥、证书、私钥和 webhook secret。
- 不绕过支付平台验签，不接受仅凭前端参数的到账请求。
- 不把支付成功直接等同于积分到账；两者必须可独立重试和审计。
- 不删除或重置现有订单和积分数据。
- 涉及中国大陆支付渠道时，先确认商户资质、主体、收款结算、实名/风控、消费者权益和相关合规要求。
- 所有第三方支付服务商的可靠性、费率、合规性和资金安全需要运营方单独评估；系统只负责提供可配置的技术接入能力。
