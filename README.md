# wrong-notebook-telemetry

[English](README.en.md)

错题本独立的匿名统计收集服务，基于 `wrong-notebook/doc/TELEMETRY_DESIGN.md` v4。**源码公开，数据仅维护者可见。** MIT 许可证；不保存用户或实例标识、错误原文、题目或 AI 对话。

## 开发状态

本提交提供服务骨架、批量 ingest、真实 libSQL 事务聚合、正式迁移、健康检查、隐私说明、测试与 CI。每日维护与看板按 [服务端设计](doc/SERVER_DESIGN.md) 在后续提交实现。尚未部署或公开发布。

## 本地开发

需要 Node.js 22.12+（22 LTS 至少 22.12，24 LTS 至少 24.0）。

```bash
npm ci --registry=https://registry.npmjs.org
cp .env.example .env.local
# 编辑 .env.local，TURSO_DATABASE_URL 使用本地数据库的绝对路径。
npm run db:migrate
npm run dev
```

本地地址 `http://127.0.0.1:3000`。`npm run db:migrate` 使用 libSQL 写事务和校验和保护迁移历史，重复执行不清库。生产与 Preview 必须连接不同数据库；构建不会自动迁移。

## 收集 API

`POST /api/v1/ingest` 不鉴权，只接受实例服务端 JSON；存在 Origin 头返回 403。最多 64KB、100 条，按 UTC 日期聚合，未知字段拒收。响应含 accepted/rejected/minIntervalSec；部分条目非法仍返回 200。无可信代理 IP 时所有请求共享每分钟十次的限流桶。

`GET /api/v1/health` 检查数据库与正式表是否可用。完整协议、匿名统计局限及原设计兼容决策见 [设计文档](doc/SERVER_DESIGN.md)，合成测试向量见 [contract-v1.json](tests/fixtures/contract-v1.json)。不要向生产服务发送测试数据。

## 验证

```bash
npm run lint
npm run test:unit
npm run test:integration
npm run ci
```

集成测试使用系统临时目录中的真实 libSQL，不访问生产或远程服务。完整 CI 含生产构建。公开文件检查：`python3 scripts/check-public-files.py`；GitHub CI 另做 gitleaks 密钥扫描。

隐私：[中文](PRIVACY.md) / [English](PRIVACY.en.md)。[部署与 Firewall 计划](doc/DEPLOYMENT.md) 包含后续外部部署步骤，本地实现不表示已创建 Turso、Vercel、远程仓库或 DNS。
