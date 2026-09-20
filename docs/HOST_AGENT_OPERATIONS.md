# 制作 Agent 环境与操作规范

生产网站运行在服务器上；PPT、口播视频和声音克隆的宿主机执行器目前运行在此 Mac。Docker 抓取 Agent 是另一类执行器，Docker healthy 不代表口播制作可用。

## 两个明确的环境

| 项目 | production | development |
| --- | --- | --- |
| 服务名 | ai.nzeta.xiaogu-production-media-agent | ai.nzeta.xiaogu-development-media-agent |
| 心跳身份前缀 | xiaogu-prod-media | xiaogu-dev-media |
| API | https://xiaogu.nzeta.ai | http://localhost:3000 |
| 配置 | ~/.config/xiaogu-agent/production-media.json | ~/.config/xiaogu-agent/development-media.json |
| 凭据来源 | ~/.config/xiaogu-agent/prod.env | 项目 .env、.env.local、.env.development.local |
| 运行代码 | 安装时解析并固定的 releases/<version>/host-worker | 当前本地仓库 |
| 日志 | ~/.xiaogu-agent/logs/production/ | ~/.xiaogu-agent/logs/development/ |
| 锁和临时文件 | ~/.xiaogu-agent/state/production/ | ~/.xiaogu-agent/state/development/ |

启动器只读取 env 文件中的 LOCAL_AGENT_TOKEN；目标地址、身份和执行代码由对应环境配置决定。生产安装必须通过现有 manifest.sha256 验证，不从脏工作区复制生产执行代码。

## 唯一管理入口

在项目根目录执行：

```sh
python3 scripts/host-agentctl.py install --env development
python3 scripts/host-agentctl.py start --env development
python3 scripts/host-agentctl.py status --env development
python3 scripts/host-agentctl.py stop --env development

python3 scripts/host-agentctl.py install --env production
python3 scripts/host-agentctl.py install --env production --release <verified-git-sha>
python3 scripts/host-agentctl.py start --env production
python3 scripts/host-agentctl.py status --env production
python3 scripts/host-agentctl.py restart --env production --confirm-production --reason "已授权的维护原因"
```

install 只生成配置和启动项，不启动；运行中的服务禁止直接覆盖启动器。start 幂等，不重启已经运行的服务。status 只读，返回环境、进程是否注册、准确身份的心跳、制作能力、三个依赖和活动任务数，不输出令牌或用户资料。

单独发布宿主机制作能力时，先使用 prepare-production-host-agent.sh 生成不可变运行目录，再 stop、install --release、start。显式指定发布 SHA 不修改 Docker 抓取 Agent 的 current 链接；生产启动器也必须来自该目录的完整性校验清单。

stop/restart 在有活动任务或无法查询任务状态时拒绝执行。status 非零并不意味着应该杀进程：先区分网络、登录、心跳和系统服务状态。日志审计位于 ~/.xiaogu-agent/logs/host-agent-management.jsonl。

## 禁止混用

- 不使用 pkill node、killall、模糊进程名或通配符批量停止 Agent。
- 本地开发不得 bootout、disable 或重新安装生产服务。
- 不绕过管理命令直接执行 scripts/local-agent.mjs；手动进程可能与常驻进程使用相同身份，掩盖彼此心跳。
- 不把“旧 PPT 服务”当成仅提供 PPT 的服务；旧 ai.nzeta.xiaogu-ppt-agent 同时承担口播和声音克隆。
- 不修改当前生产 runtime；新版本由 xiaogu-deploy 发布流程生成，通过完整性校验后再安装切换。
- 多个任务同时工作时，由一个任务负责服务启停，其他任务仅做只读检查与代码修改。

## 首次迁移

先查询两个端点的心跳和活动任务。确认旧执行器空闲后，按精确 PID 或精确 launchd 标签停止旧执行器；保留旧 plist 备份但禁用旧标签，然后安装并启动对应的新服务。不要修改 Docker 抓取 Agent。迁移后至少跨三个心跳周期核验，生产、本地分别检查。

本地有进行中的任务时可使用：

```sh
python3 scripts/host-agentctl.py start --env development --drain-legacy
```

新服务先等待旧身份的已租用任务全部结束，并要求新鲜的空闲心跳；交接期间使用短数据库锁避免新租约与停服竞争。然后按精确标签卸载旧本地服务并接管。等待期间旧服务继续完成视频，新服务不会领取任务。生产不支持此旧本地交接选项。

旧标签：ai.nzeta.xiaogu-ppt-agent（生产），ai.nzeta.xiaogu-local-spoken-agent（本地）。旧脚本入口改为指向新的管理流程，避免重新注册旧标签。

## 故障判断与边界

有效制作状态要求：平台开关开启、身份匹配、协议版本匹配、45 秒内心跳、节点 ready/busy、digital-human.video.produce=true，且 codexCli/heygenCli/ffmpeg 均 healthy。

KeepAlive 可以拉起退出的进程，不能抵抗显式 bootout/disable；有权限的其他任务仍能绕过本规范，因此本规范不是 OS 权限隔离。机器休眠、断网仍会让线上离线。

目前两环境仍共享同一 Mac 和用户登录下的 Codex/HeyGen 账户。工作目录隔离不等于账户或计算资源隔离。长期生产应迁到独立常在线执行机，或独立 OS 用户并分别登录；不要复制登录令牌来伪造隔离。

## 大视频上传

16 MiB 以上的口播母片和成片使用 8 MiB 分片、最多 8 路上传，单片失败独立重试，已确认分片在任务隔离缓存中保留。Web 校验任务/分片归属、分片顺序、总长度和完整 SHA-256 后在媒体节点合并，完成后清理分片。完整媒体上限仍为 500 MiB；已完成版本不可覆盖。线上验收使用 `node scripts/regression-spoken-multipart-upload.mjs --production --large`，从实际制作宿主机上传 160 MiB 合成文件，不调用生成供应商。
