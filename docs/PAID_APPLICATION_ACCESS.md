# 真实充值用户专享应用（首期）

普通应用检查积分；`paid_customer` 应用先检查真实充值资格，再检查积分。默认只有 `digital-human-video` 开启，后台「内容管理 → 应用」可逐个修改使用条件。应用目录同步不会覆盖后台设置。

充值资格与角色、积分余额无关。管理员账号不豁免；注册赠送、后台赠送、活动兑换、返利、模拟订单、Stripe 测试支付、零元支付、管理员手工标记 paid 都不能解锁。解锁后可使用全部可用积分，包括赠送积分。

## 收款依据

- Stripe：已验签的支付完成事件，session 为 live 且 payment_status=paid，金额、币种与本地订单一致，保存 payment_intent 凭据。
- 易支付：必须有有效签名、商户号、平台流水号及匹配金额。按订单绑定的支付实例验签。商户 out_trade_no 可匹配本地订单 UUID。
- 手工转账：管理员审核通过、有审核人及转账凭据。仅修改订单状态不会解锁。管理员需在审核前核验实际到账。
- 资格查询或应用规则查询失败时返回 503，不允许回退到无门槛的静态应用配置。

真实收款存入 `verified_payment_receipts`。只有状态为 paid/completed 且净实付大于零的凭据参与资格判断，按币种分别统计。管理员退款后本地订单状态立即撤销该订单资格。Stripe `charge.refunded` 保存累计退款证据，处理部分退款、全退、重复与乱序事件；其他通道在平台后台登记退款后撤销。易支付商户端单独退款目前无自动同步，应同步后台订单状态。

## 使用与计费

- 通用应用 POST、prepare、stream、topics、PPT 独立提交、聊天助手应用执行和后台应用执行都检查应用资格。
- 口播独立 POST 在解析并提交生成任务前检查资格及余额，覆盖新口播流程和旧生成流程。
- 已有作品的读取、下载不受付费资格限制。
- 页面展示充值专享/已解锁，15 秒轮询及回到页面时刷新；充值链接新标签打开，保留原表单。
- 独立视频任务创建时锁定当前应用积分价格；成功完成由数据库触发器写入本地 usage_logs，仅记一次。失败不记费，迁移前没有 quota_cost 的历史任务不补扣。沿用现有余额准入方式，不新增积分预冻结体系。

## 上线步骤

1. 正常部署流程先执行 `084_paid_application_access.sql`，再启用新代码。已在独立 PostgreSQL 空库验证全部迁移。
2. Stripe webhook 除 `checkout.session.completed` 外，订阅 `checkout.session.async_payment_succeeded` 和 `charge.refunded`。
3. 核验历史在线支付后再全面开放新规则，避免老付费用户被错误拦截：

```sh
# 使用目标环境的数据库、Stripe 凭据和 SETTINGS_ENCRYPTION_KEY；默认只核验
node --env-file=.env --experimental-strip-types scripts/backfill-paid-access.mjs
# 核验并保存收款依据，不发积分、不修改订单状态
node --env-file=.env --experimental-strip-types scripts/backfill-paid-access.mjs --apply
```

脚本向 Stripe 查询真实支付和退款信息，可解密订单绑定实例的配置；测试支付不入账。易支付等无法仅靠旧库记录证明收款的订单输出 `needs_manual_reconciliation`，必须对账后处理，不可批量把 paid 订单当成真实支付。迁移仅自动识别已有凭据且审核通过的线下转账。

## 验证

```sh
npm run typecheck
npm run test:paid-access
# 完整数据库集成测试：仅允许独立的本机 paid_access_test 数据库
PAID_ACCESS_TEST_DATABASE_URL=postgresql://...@127.0.0.1:PORT/paid_access_test npm run test:paid-access
```

集成测试需先在该独立库执行完整迁移。覆盖无充值管理员、赠送积分、模拟与手工改状态订单、资格动态切换、实付解锁、重复凭据、部分与全额退款、退款先于支付、其他有效订单保留资格、线下凭据、失败/重复视频回调及数据库异常拒绝放行。

## 后台人工配置专享应用权限

在「管理后台 → 用户管理 → 查看详情 → 专享应用权限」配置：

- 自动判断：根据有效真实充值记录判断，是未配置用户的默认模式。
- 人工开通：支持 7 天、30 天、永久和自定义日期。到期后即时回退自动判断，无需定时任务。
- 禁止使用：即使已有真实充值也不能生成专享应用内容；普通应用、已有作品查看和下载不受影响。

每次修改都必须填写操作原因。当前模式、生效来源、有效期和最近 20 次修改可在同一面板查看；更早的记录保留在后台审计日志。日志包含操作人、时间、原因和修改前后配置。使用乐观版本检查防止覆盖其他管理员的修改，配置与日志在一个数据库事务内提交。

人工开通只影响访问资格，不产生支付订单、积分、充值统计或邀请返利；生成仍通过原有余额检查和扣分逻辑。取消人工授权时选择「自动判断」；若该用户本身有有效真实充值，仍会继续解锁。要明确阻止使用，应选择「禁止使用」。

用户端只展示“已解锁”或“已暂停”，不披露内部操作原因。暂停时不显示充值解锁按钮，避免误导用户。

此版本上线需先执行 `086_exclusive_app_access_overrides.sql`。管理接口为 `/api/admin/users/exclusive-access`（GET/PATCH），只允许有效管理员访问。日期按当前设备时区选择，传到服务端时转换为 UTC。已过期日期、缺失原因、并发旧版本请求均会被拒绝。

附加接口回归（仅本机独立测试库；预览需关闭 demo 积分，计量服务可指向本机测试地址）：

```sh
PAID_ACCESS_TEST_DATABASE_URL=postgresql://...@127.0.0.1:PORT/paid_access_test \
PAID_ACCESS_TEST_BASE_URL=http://127.0.0.1:3198 AUTH_SECRET=本机测试密钥 \
node --experimental-strip-types scripts/test-exclusive-access-http.mjs
```
