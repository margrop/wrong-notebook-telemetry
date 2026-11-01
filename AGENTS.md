# AGENTS.md

本文件适用于本仓库中的 AI 代理。回复、代码注释和提交说明使用简体中文；英文 README 与隐私文档保持英文。

## 项目边界

wrong-notebook-telemetry 是错题本的独立匿名统计收集服务：接收实例服务端上报，按 UTC 日期聚合，向维护者提供私有看板。源码采用 MIT 许可证公开，统计数据与密钥私有。

- 技术栈：Next.js 16 App Router、React 19、TypeScript、Zod 4、Prisma 5.22、同版本 libSQL adapter、兼容的 `@libsql/client`。
- 运行时：Node.js，不使用 Edge；开发及自建进程默认监听 `127.0.0.1`。
- 存储：生产使用 Turso，本地与测试使用 libSQL 文件。不要将此仓库与错题本实例仓库的数据库、登录系统或遥测队列混用。
- 设计与协议以 `doc/SERVER_DESIGN.md` 为准，部署见 `doc/DEPLOYMENT.md`，验证证据见 `doc/VERIFICATION.md`。
- 发布源码不等于上线收集服务；未完成真实部署与实例端联调前，不替错题本或官网宣称遥测已经启用。

## 目录

| 路径 | 作用 |
| --- | --- |
| `src/app/api/v1/` | 批量收集与数据库就绪检查 |
| `src/app/api/cron/` | 鉴权后的每日维护 |
| `src/app/api/dashboard/` | 看板登录、退出、服务设置、错误状态与备注 |
| `src/app/dashboard/`、`src/components/` | 私有服务器组件与交互表单 |
| `src/lib/ingest-contract.ts`、`ingest.ts`、`aggregate.ts` | 协议、入口防护与事务聚合 |
| `src/lib/dashboard-*`、`require-dashboard.ts` | 会话鉴权、受保护接口与统计查询 |
| `src/lib/service-settings.ts`、`maintenance.ts` | 设置缓存、保留期、用量快照与预算降频 |
| `prisma/`、`scripts/migrate.ts` | 数据模型与不可变的正式迁移 |
| `tests/unit/`、`tests/integration/`、`tests/fixtures/` | 单元测试、真实临时数据库集成测试、合成契约向量 |
| `scripts/ci.sh`、`scripts/smoke.mjs` | 完整本地 CI 与生产 HTTP 冒烟 |
| `.github/workflows/ci.yml`、`.githooks/` | GitHub 检查与本地推送检查 |

## 常用命令

```bash
npm ci --registry=https://registry.npmjs.org
npm run db:generate
npm run db:migrate
npm run password:hash
npm run dev
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration
npm run ci
```

- Node.js 至少 22.12；GitHub CI 使用 Node.js 22。精确依赖与引擎限制以 `package.json` 和锁文件为准。
- 安装、升级依赖均使用 npm 官方 registry，提交前确认锁文件没有 npmmirror；不要用 `--force` 或 `--legacy-peer-deps` 掩盖不兼容的 Prisma/adapter/client 组合。
- 先从 `.env.example` 创建被忽略的 `.env.local`。本地数据库使用绝对路径，不能把真实环境变量或数据库提交到 Git。
- 密码工具提供原始 bcrypt 哈希和本地转义写法；Next.js 的 `.env.local` 要转义哈希中的美元符号，平台环境变量使用原始值。
- 生产构建与启动命令为 `npm run build`、`npm start`。除非用户明确要求或运行完整 CI，不主动执行生产构建。

## 协议与隐私约束

- 不接收用户/实例 ID、邮箱、题目、OCR、AI 对话、原始错误、堆栈、页面路径或 UA。不要新增原始事件表、精确上报时间、来源追踪或可关联实例的字段。
- ingest 为服务端到服务端接口：存在 Origin 头就拒绝，不添加 CORS 放行。请求体按流式实际字节限制为 64KB，每批最多 100 条；不能仅相信 Content-Length。
- 批次和条目保持严格对象校验，payload 只允许受限短 token 和布尔值；事件名保持结构校验，不在收集服务维护事件白名单。
- 保留对 `aiConfigured` 驼峰维度、`api:ai` 与 `[GlobalError]` scope 的兼容，避免把已确认样例误判为非法。
- day 采用 UTC，仅接受今天前七天至后一天。按天统计不能作为精确去重实例数或计费依据。
- 部分条目非法仍确认整个批次并返回接受/拒收数量，避免实例无限重发。暂停会确认并丢弃批次，503 才用于保留待发数据的临时故障；停用协议或版本返回 410。
- IP 仅能从可信代理头临时读取并生成进程内 HMAC 限流键；IP 和摘要均不落库、不打日志。自建代理必须清洗转发头后才能启用 `TRUST_PROXY_HEADERS`。
- 日志只记录固定错误码，不序列化异常对象、请求头、请求体、密码、令牌或数据库地址。平台访问日志的边界须如实披露。
- 修改协议时同步 `ingest-contract.ts`、`tests/fixtures/contract-v1.json` 与相关测试；涉及不兼容变更时升级协议并安排实例端契约联调。

## 数据库、维护与鉴权

- TypeScript 使用具体类型或 `unknown`，类型导入使用 `import type`；服务器模块保留 `server-only` 边界。
- 查询通过 Prisma 参数化执行；多行 upsert 使用 `Prisma.sql`/`Prisma.join`，禁止拼接未校验 SQL。
- 一个批次在同一事务中更新事件、错误、指纹和用量；每表一条多行 upsert，避免逐条 Turso 网络往返。乱序上报不能倒退首次/最近日期，也不能覆盖人工状态和备注。
- 修改 schema 后追加并提交正式迁移，禁止修改已应用迁移、清库、自动重建表或在构建阶段执行生产迁移。统一使用 `npm run db:migrate`；不要假定 Prisma 5 的 migrate deploy 可直接访问 libsql URL。
- Production 与 Preview 使用独立数据库；测试必须使用系统临时目录中的真实 libSQL，不访问生产或远程服务。
- 保留今天及此前 399 天的日统计。Cron 必须鉴权，重复执行不能清零上报用量；用量快照不能冒充平台账单。预算未配置时不编造免费额度，自动降频只能提高发送间隔。
- 所有私有查询前鉴权，不能仅依赖布局鉴权，防止 App Router 并行执行页面时提前读库。登录及写接口保持同源校验，凭据缺失时关闭访问。
- 保持七天签名会话、HttpOnly、SameSite=Strict、生产 Secure/Host Cookie 与登录限流；密钥或密码轮换应使旧会话失效。
- UI 文案集中到 `src/lib/translations.ts`，组件明确 Props、兼容移动端；错误备注按文本转义，禁止作为 HTML 渲染。

## 测试与文档

- 修改逻辑后运行 `npm run test:unit && npm run test:integration`，并完成 Lint 零警告与类型检查。仅改文档或注释时可跳过逻辑测试。
- 涉及构建、鉴权、路由或数据库依赖的变化运行 `npm run ci`，包含生产构建与真实 HTTP 冒烟；失败应修复，不删减或弱化断言。
- 保留日期边界、实际字节限制、批量上限与参数边界、并发累加、事务回滚、限流、暂停/停用、缓存、迁移校验、保留期、会话及同源保护的验证。
- 测试数据均为合成数据，不把向真实服务发送样例当作默认验收方式。截图、日志、凭据和临时副本放到 `mktemp` 目录，结束后清理。
- 功能与配置变化同步更新 `README.md`、`README.en.md` 及受影响的设计、部署、隐私文档。记录实际执行环境与结果，不把历史测试或 CI 配置当作当前已通过的证据。

## Git 与发布

- `main` 是公开主线；公开远程名称为 `github`，Gitea 镜像名称为 `gitea`，地址保存在本地 Git 配置。不要把私有远程地址、部署记录或环境配置带入公开源码和历史。
- 每个工作副本执行 `git config core.hooksPath .githooks`。提交说明格式为 `<type>: <中文描述>`，按功能拆分，不添加 AI 署名。
- 推送前展示状态、待发布提交和相关 diff，运行 `python3 scripts/check-public-files.py`，并用 `gitleaks git --redact` 扫描待发布历史。仅扫描工作区不能替代历史密钥扫描，不得声称未执行的检查已通过。
- 用户明确要求提交、推送或发布即视为授权，不重复请求确认；未获相应授权时不擅自创建远程仓库、推送、打标签、部署或改 DNS。推送授权不自动包含部署和 DNS 操作。
- 保留完整提交历史，不强推、不覆盖远程已有提交。先确认远程当前状态，遇到保护分支按规则处理。
- 发布后检查 GitHub 实际 CI 结果，并确认本地 HEAD、`github/main` 与 `gitea/main` 的远程 SHA 相同，工作区干净。不要把 push 退出码或已创建的工作流视为最终验收。
