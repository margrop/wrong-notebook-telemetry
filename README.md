# wrong-notebook-telemetry

[English](README.en.md)

错题本独立的匿名统计收集服务，基于 `wrong-notebook/doc/TELEMETRY_DESIGN.md` v5。**源码公开，数据仅维护者可见。** MIT 许可证；不保存用户或实例标识、完整错误堆栈、题目或 AI 对话。每个错误指纹只保存首次脱敏摘要、应用栈首帧、去掉 ID 的路径、部署形态与渲染 digest。

## 已实现

- 批量收集：每批最多 64KB / 100 条，逐条校验、部分拒收、日期窗口与内存限流。
- 聚合存储：Next.js 16 + Prisma 5.22 + Turso/libSQL，只保存按天分组的计数与指纹首次样本，单表多行 upsert 减少远程往返，事务累加并兼容乱序错误上报；错误按部署形态分组。
- 维护与控制：400 天保留期、每日存储快照、可配置预算降频、暂停与版本停用。
- 私有看板：登录保护，日活/安装趋势、版本与部署形态、功能维度、AI 成功率/耗时、按状态筛选的错误指纹、首次样本、单指纹详情及人工状态和备注。
- 本地正式迁移、隐私页、中英文文档、公开文件检查、gitleaks CI，以及生产 HTTP 冒烟。

本仓库提供可本地运行的服务端实现。部署到 Vercel/Turso、配置域名及错题本实例端接入，需按部署文档单独执行。

## 本地运行

需要 Node.js 22.12+（22 LTS 至少 22.12，24 LTS 至少 24.0）。

```bash
npm ci --registry=https://registry.npmjs.org
cp .env.example .env.local
npm run password:hash
```

编辑 `.env.local`：将 `TURSO_DATABASE_URL` 设为持久化本地文件的**绝对路径**，填入生成的 bcrypt 哈希，并分别配置至少 32 字符的 `DASHBOARD_SESSION_SECRET` 与 `CRON_SECRET`。密码哈希工具提供本地转义写法；Next.js 会展开美元符号，不能把原始 bcrypt 字符串直接粘贴进 `.env.local`。Vercel 平台环境变量使用原始哈希。

```bash
npm run db:migrate
npm run dev
```

打开 `http://127.0.0.1:3000/dashboard`，用刚才设置的密码登录。开发 Cookie 允许本地 HTTP；生产 Cookie 强制 Secure，正式运行需 HTTPS。未配置凭据时关闭看板访问。

`npm run db:migrate` 用 libSQL 写事务和校验和保护迁移历史，重复执行不清库。构建不自动迁移。生产和 Preview 必须使用不同数据库。

## 接口

| 路径 | 方法 | 访问 |
| --- | --- | --- |
| `/api/v1/ingest` | POST | 实例服务端匿名上报，不接受 Origin 头 |
| `/api/v1/health` | GET | 数据库就绪检查 |
| `/api/cron/maintain` | GET | CRON_SECRET Bearer 鉴权 |
| `/api/dashboard/login`、`logout` | POST | 同源请求 |
| `/api/dashboard/settings` | PATCH | 登录 + 同源 |
| `/api/dashboard/errors/:fingerprint` | PATCH | 登录 + 同源 |
| `/dashboard`、`/dashboard/settings` | 页面 | 登录 |
| `/privacy` | 页面 | 公开 |

ingest 的 accepted/rejected 以条目计；部分非法条目仍返回 200，未知字段被拒绝。暂停会确认并丢弃当前批次，版本或协议停用返回 410。无可信代理来源时，调用共用每分钟十次限流桶。完整协议、原设计样例的兼容解释与隐私边界见 [服务端设计](doc/SERVER_DESIGN.md)。[测试向量](tests/fixtures/contract-v1.json) 均为合成数据，勿发到生产。

## 维护与用量

每天 UTC 03:17 执行维护，保留今天及此前 399 天的日统计，清理过期指纹并记录存储快照。Vercel Hobby 实际触发可在该小时内浮动；自建 Node.js 必须自行配置调度器。

月批次、存储行数、数据库字节预算可选，默认不编造免费额度。配置预算达到 70%/90% 时，最小发送间隔自动提高到至少 12/24 小时。应用成功批次和数据库分配量不等于平台账单，需同时启用平台用量通知。

统计可重复、漏报或伪造，只用于趋势参考。日活是 instance_alive 的近似计数；多日合计为实例天数，不能当作去重实例数。

## 验证

```bash
npm run lint
npm run test:unit
npm run test:integration
npm run ci
```

完整 CI 包含生成 Prisma Client、Lint、44 个单元测试、27 个真实数据库集成测试、生产构建、类型检查和真实 HTTP 冒烟。冒烟使用临时数据库启动生产服务器，验证登录、上报实际计数、协议 v2 首次样本、私有页面保护、看板、错误标记、设置、维护与退出；结束后清理进程和临时数据，不访问外部服务。已有生产构建可运行 `npm run test:smoke` 单独检查。

公开前执行 `python3 scripts/check-public-files.py` 和 gitleaks；仓库 CI 包含两者。新工作副本运行 `git config core.hooksPath .githooks`。

详见 [设计](doc/SERVER_DESIGN.md)、[部署/Firewall/验收步骤](doc/DEPLOYMENT.md)、[隐私说明](PRIVACY.md) / [Privacy](PRIVACY.en.md)。密钥、本地数据库、真实统计、截图与导出不得提交。
