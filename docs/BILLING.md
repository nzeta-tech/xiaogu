# Quota 与充值设计

## 用户展示

建议对保险经纪人展示为“创作点数”，不要展示 token。

参考定价：

- 今日热点选题：2 点
- 生成选题角度：3 点
- 生成口播稿：5 点
- 改写平台风格：2 点
- 合规检查：2 点
- 深度选题研究：8 点

## 生产扣费流程

```text
用户发起请求
-> 查询 OpenMeter entitlement
-> hasAccess 为 true 才继续
-> 调用模型/搜索/热榜
-> 生成成功
-> ingest usage event
-> 返回结果和剩余额度
```

## 支付成功流程

```text
支付平台 webhook
-> 校验签名
-> 写订单状态
-> OpenMeter 发放 prepaid credits
-> 通知用户充值成功
```

当前代码入口：

- `src/lib/billing/openmeter.ts`
- `src/lib/billing/plans.ts`
- `src/app/api/billing/balance/route.ts`
- `src/app/api/billing/consume/route.ts`
- `src/app/api/billing/plans/route.ts`
- `src/app/api/billing/orders/route.ts`
- `src/app/api/billing/webhook/route.ts`

生产环境必须先校验支付平台签名，再调用 `grantCredits`，不能信任前端传入的 `userId` 或 `quotaAmount`。

## 积分到账邮件

充值、手工转账审核通过、管理员补发或标记到账、管理员赠送和注册赠送都会写入可去重的邮件发件箱。退款积分回收和支付订单超时关闭也会通知用户。邮件发送不会阻塞支付 webhook；SMTP 临时不可用时会按退避策略重试最多 6 次。

部署环境应每分钟调用一次下列受保护接口，处理失败重试和服务重启期间遗留的待发邮件：

```text
POST /api/internal/credit-notifications/dispatch
Authorization: Bearer ${CREDIT_NOTIFICATION_SECRET}
```

`CREDIT_NOTIFICATION_SECRET` 未配置时可使用 `CRON_SECRET`。在后台“系统设置 -> 邮件”配置并启用 SMTP 后，可编辑积分变动邮件模板；模板变量包括 `{{name}}`、`{{changeLabel}}`、`{{delta}}`、`{{balance}}`、`{{orderId}}` 和 `{{url}}`。

## 当前套餐

- 基础包：99 元 / 300 点
- 专业包：299 元 / 1200 点
- 机构包：1299 元 / 6000 点

## 订单状态建议

- `pending`：已创建，待支付
- `paid`：支付成功，已发放 credits
- `failed`：支付失败
- `refunded`：已退款
- `closed`：超时关闭

正式支付接入时，前端只创建订单并跳转支付。额度发放必须由支付 webhook 完成。

## Stripe 接入

当前已实现：

```text
POST /api/billing/orders provider=stripe
-> 创建 orders 记录
-> 创建 Stripe Checkout Session
-> 保存 provider_order_id 和 checkout_url
-> 前端跳转 Stripe Checkout
-> Stripe webhook 调 /api/billing/webhook
-> 验签成功
-> 标记订单 paid
-> OpenMeter 发放 credits
```

需要配置：

```text
NEXT_PUBLIC_APP_URL=https://your-domain.com
STRIPE_SECRET_KEY=sk_live_or_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
```

Stripe webhook 事件至少订阅：

```text
checkout.session.completed
```

本地开发可使用 Stripe CLI：

```bash
stripe listen --forward-to localhost:3000/api/billing/webhook
```

## 必备数据表

- users
- broker_profiles
- conversations
- messages
- drafts
- orders
- payment_events
- usage_logs
- compliance_reports
- organization_members
- approval_tasks
