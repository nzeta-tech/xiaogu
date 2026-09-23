# 本项目运行服务约束

## 制作 Agent

开始任何制作 Agent 启停或维护前，阅读 docs/HOST_AGENT_OPERATIONS.md。

- 统一入口：`python3 scripts/host-agentctl.py <action> --env production|development`。环境必须明确。
- 本地开发和 UI 调整不包含生产服务启停。不要因名称包含 PPT 就停止旧 `ai.nzeta.xiaogu-ppt-agent`；它还承担口播视频和声音克隆。
- 不使用模糊 `pkill`、`killall`、通配符、或绕过管理入口的 `launchctl bootout/disable`。首次迁移在确认任务空闲后可按精确标签处理，并记录迁移。
- 不手动另起同身份的 `scripts/local-agent.mjs`。不要覆盖其他任务的运行进程或未提交改动。
- 生产运行代码只能来自已验证的不可变发布目录，不得复制工作区修改覆盖 current runtime。
- 用户已明确授权当前操作时，不重复索要许可；执行生产停止或重启时在命令中填写 `--confirm-production --reason`，这是审计参数。
- 多任务并行维护时，先明确启停归属，其他任务只做只读诊断。上线前使用 xiaogu-deploy 发布流程。
