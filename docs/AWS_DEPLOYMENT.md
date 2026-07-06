# AWS 部署方案

## 推荐架构

```text
CloudFront + WAF + ACM
-> Application Load Balancer
-> ECS Fargate
   - Next.js app
   - OpenMeter service
   - worker/scheduler
-> RDS PostgreSQL
-> ElastiCache Redis
-> S3
-> Secrets Manager
-> CloudWatch
```

## 部署前需要准备

- AWS 账号和临时 IAM 部署权限
- 域名，推荐 Route53 托管
- 模型 API Key
- 搜索 API Key
- 支付平台密钥
- 生产环境变量

## 建议上线步骤

1. 创建 ECR 仓库。
2. 构建并推送 Docker 镜像。
3. 创建 RDS PostgreSQL 和 ElastiCache Redis。
4. 把密钥写入 Secrets Manager。
5. 创建 ECS Cluster、Task Definition、Service。
6. 通过 ALB 暴露应用。
7. 配置 ACM 证书和 CloudFront。
8. 配置支付 webhook 域名。
9. 跑 smoke test：注册、登录、对话、扣 quota、充值回调、保存草稿。
