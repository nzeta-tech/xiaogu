# V3 通用混剪发布验收

状态：Web 三节点与制作执行器已上线，线上业务验收通过；V3 已正式提交，成片尚未验收。

## 发布身份

- 候选 `6f75fac62291`，Web 与制作执行器基线 `c762c201270f`，协议保持 1。
- 来源为独立干净发布分支；原工作区其他未提交修改未纳入。
- Web 发布含 13 个变更文件，新增 3、修改 10，无删除或重命名。完整差异按通用表达、质检分级、建议持久化及展示范围审阅。
- 保留全部 200 个页面/API、96 个迁移原始内容、37 个 package scripts。生产迁移清单 96/96 已应用；lineage=forward。
- bundle：`6f75fac62291-ddb88c0cb5c6-ab3fe5dd9580`。
- Web artifact：139169792 字节；manifest SHA256 `2f40927d4bf89da351237bb9a7495a8551ab7eff3e94acd8adef1281090271bb`。
- Host manifest SHA256 `10ea3d64dc8915197a3709bd4a5e5b519be00dca536984979b2dd8ab88f5526e`。

## 激活结果

- Web 最终版本 `6f75fac62291`，三节点 current、完整 manifest 与 running 状态复核一致；三个 ALB target 均恢复 healthy，未发生应用回滚。
- 正式发布耗时 413 秒（prepare 20、stage 58、activation 305、smoke 15；不含先行构建/候选验收），每节点实际发送约 1.58 MB，复用相同文件。
- 公网 readiness=true、所有必需依赖健康；既有可选 OpenMeter 遥测异常仍存在，未宣称修复。
- Host 最终版本 `098150c46590`，在 Web 版本之上仅增加三个制作脚本/测试文件的避让修复：任何语义类型的原文图解全屏，开场标题在图解及过渡入场前结束。Web/API/协议/数据库无变化，与 Web `6f75fac62291` 兼容。
- Host 最终 manifest SHA256 `3155d603385e9b641b2fc0552cf2b1c3f1ba4eefb5643f6f29c76b809e5198b1`；三次新鲜心跳 ready、protocol=1、三项依赖 healthy、activeTasks=0。
- 补充布局/标题和混剪回归通过，真实 FFmpeg 测试通过；累计增加 1 个独立标题避让测试。无变更的 Docker 抓取 Agent 未重建或重启。
- 任务开关在失败保护下开启，真实来源验收通过：10 个 SSE delta、1417 字转录，与持久化一致，无敏感媒体字段；隔离验收账号已清理。
- 线上交付 HTTP/DB/浏览器 41 项全部通过，无付费媒体生成调用；隔离账号已清理。最终三次执行器心跳均 enabled=true、ready、protocol=1、三项依赖健康。

## V3 提交

- 正式版本 API 幂等提交，任务 `cf7d49b4-5f12-4702-8bba-4c4ec48d9ed6`，revision=3，quotaCost=0。
- 保留口播全文、声音、人物、时长与画幅；仅重新制作混剪画面，原归档母片身份未变。
- 本机状态 `outputs/guyu-photo-20260920/v3-recut.json` 保存请求标识及母片校验值，不保存会话凭据。
- 原 V2 保持 cancelled，不伪装成成功，不产生成功扣费；V3 成片仍需独立最终质检，不把提交成功当作生成成功。

## 验证

- 57 项不同的表达、规划、质检、混剪、母片复用和交付门禁测试通过；另有 1 项隔离 PostgreSQL 计费事务测试通过。
- 真实 FFmpeg 双画幅字幕/PIP 像素与缓存检查、基础版无素材文件的母片降级全片解码通过。
- 新表达渲染双画幅非空且字幕区域无正文；预览检查已执行。
- TypeScript、干净 standalone 构建及 Linux Alpine/x64 原生 Sharp 验证通过；构建前后 bundle 一致，源码保持干净。
- 候选实际交付 HTTP/DB/浏览器 41 项通过：失败/缺报告/矛盾通过报告不能交付与扣费；正常和仅建议结果允许交付且只扣一次；建议持久化、刷新展示、移动端无横向溢出。
- 版本 HTTP 验证所有权、锁定输入、幂等、并发修改、V1→V2→V3、选中版本、原版本不变、失败隔离和无重复扣费。
- Candidate readiness 的生产依赖检查返回 503，不作为生产 readiness 证据；候选功能验收使用隔离 DB，正式生产 readiness 另行验证。
- Studio 内容持久化路径本轮未改动；适用目录 `spoken:expression`、`spoken:master-reuse`、`spoken:quality-delivery`、`billing:completion`；catalog existing coverage extended / merged。

## V2 处理

- 用户授权取消目标 V2；操作时仍 processing、第三轮质检，未成功交付。
- 对指定用户和任务加事务锁，撤销租约并写入取消事件；作品保存停止原因，不改写为成功。
- 编码子进程在取消执行前已结束，因此没有发送进程停止信号；随后确认执行器 activeTasks=0。
- V2 taskStatus=cancelled、作品 status=failed / stage=cancelled、charges=0；原母片身份和 SHA256 未变。
- 新执行器通过管理入口在空闲时 stop/install/start，不覆盖不可变目录、不重启无变更的 Docker 抓取服务。

## 限制

结构化原文校验不等于语义关系必然正确；仍需最终质检。此轮是通用表达基础版本，不声称逐帧人脸保真或全题材一次成功。
