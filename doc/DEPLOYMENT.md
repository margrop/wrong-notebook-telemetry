# 部署与运维

本仓库可部署到 Vercel 或常驻 Node.js 服务。源码公开，数据仅维护者可见。本文是待执行的部署步骤，不表示已经创建项目、数据库、DNS 或远程仓库。

## Vercel 与 Turso

1. 创建 Vercel 项目 `wrong-notebook-telemetry`，生产分支设为 `main`，使用支持的 Node.js 22 或 24，默认 Node.js 运行时与 Fluid Compute。
2. 在项目目录运行 `vercel integration discover --category storage` 确认当前 Turso 集成，再按当前 CLI 提示运行 `vercel integration add`。不把历史集成标识写死。
3. 生产和 Preview 分别连接独立 Turso 数据库。确认 `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` 只注入对应环境；禁止预览库复用生产库。
4. 用 `vercel env pull` 将开发环境变量拉到被忽略的 `.env.local`，或按 CLI 支持的环境参数拉取到受限临时目录。每次迁移前核对目标环境和数据库；备份生产库后显式运行 `npm run db:migrate`。不要在每次 Preview 构建时自动执行生产迁移。
5. 用 `npm run password:hash` 交互生成 bcrypt 哈希；平台环境变量填原始值，本地 `.env.local` 使用工具输出的美元符号转义写法，避免 Next.js 环境变量展开损坏哈希。设置 `DASHBOARD_PASSWORD_HASH`，分别配置至少 32 字符的 `DASHBOARD_SESSION_SECRET` 和 `CRON_SECRET`。不要在 Shell 历史、命令参数、仓库或日志中直接放密码/令牌。
6. 从 `.env.example` 核对其余变量。预算按当前控制台额度与预留量配置，不照搬旧套餐数值；开启 Vercel/Turso 用量通知。
7. 执行本地 `npm run ci`，部署 Preview 并完成下述验收后再发布 Production。

Vercel 读取的是 **vercel.json**；原方案中的 vercel.ts 是概念文件名，不是本项目实际配置入口。每日 Cron 为 UTC `17 3 * * *`。截至 2026-11-01 核对的官方文档显示 Hobby 每个 Cron 最快每日一次，触发精度为小时级；任务不依赖精确分钟。非商用前提和套餐资格必须由部署者确认。

## 域名

在 Vercel 项目的 Domains 添加 `wrong-notebook-telemetry.margrop.net`，在 Cloudflare 添加 Vercel 实际给出的 CNAME 目标，选择“仅 DNS”。不要猜测 CNAME 目标，也不要把可变的 Vercel 调试域名写入实例发布配置。检查 HTTPS 证书与续期状态后，实例 endpoint 才能填入：

```text
https://wrong-notebook-telemetry.margrop.net/api/v1/ingest
```

## Firewall

截至 2026-11-01 核对的 Vercel 官方文档：Hobby 每项目可用一条 WAF 限流规则，固定窗口，计入最多三条自定义规则；具体请求额度以控制台为准。应用内存限流仍始终启用，多函数实例之间不会共享计数。

当前 Vercel CLI 64.7.0 支持以下命令。先查看项目现有规则，避免占用或覆盖已有防护；规则以草稿方式创建，经检查后发布：

```bash
vercel firewall status
vercel firewall rules add "匿名上报限流" \
  --condition '{"type":"path","op":"eq","value":"/api/v1/ingest"}' \
  --action rate_limit \
  --rate-limit-algo fixed_window \
  --rate-limit-keys ip \
  --rate-limit-requests 10 \
  --rate-limit-window 60
vercel firewall diff
vercel firewall publish
```

应用层按 IP 只能尽力限流；平台层在请求进入函数前拦截，更适合防止调用量放大。匿名上报没有共享密钥，统计可以伪造，不用于计费或安全审计。

## 上线验收

- `/api/v1/health` 返回 200 且 body.status 为 ok；未迁移/不可连接数据库应返回 503，不能只检查进程存活。
- 未登录访问 `/dashboard` 和 `/dashboard/settings` 跳转到 `/login`；登录后才能看到真实聚合。检查 Cookie 的 HttpOnly、Secure、SameSite=Strict 和七天有效期。
- 用合成样例在 Preview 上报，确认 accepted/rejected 及数据库实际计数；错误原文和额外字段应被拒绝。不要向生产服务发送仓库测试向量。
- 在看板修改最小间隔、暂停和停用版本，最多五分钟后抽查不同函数实例的响应；版本停用为 410，暂停会确认并丢弃当前批次。
- 验证 Cron 的有效和无效 Bearer 鉴权、实际清理边界、当天存储快照和预算预警；在平台确认真实 Cron 执行记录。
- 使用错题本实例的可配置 endpoint 指向 Preview，验证队列重试、410 停发和退避指令，然后才能声称跨仓库联调通过。
- 确认生产/预览数据库地址不同，公开仓库不包含 `.env*`、数据库、真实统计、截图或导出。公开前运行 `python3 scripts/check-public-files.py` 和 gitleaks。

## 自建 Node.js

运行 `npm ci --registry=https://registry.npmjs.org`，配置 `.env.local`，显式迁移后构建并 `npm start`。生产通过 HTTPS 反向代理访问；默认仅监听 127.0.0.1。代理必须删除外来转发头并写入真实的 `X-Forwarded-For`，再设置 `TRUST_PROXY_HEADERS=true`；应用端口不得允许绕过代理直连。

自建平台不会执行 Vercel Cron。自行配置每天一次的调度器，用 Secret 管理工具注入 `Authorization: Bearer` 调用 `/api/cron/maintain`，不要将令牌明文写入 crontab 或仓库。数据库文件使用持久化路径并安排备份。

## 应急与恢复

`INGEST_PAUSED=true` 停止接收并下发 3600 秒退避；`false` 显式解除数据库暂停；留空沿用看板配置。`INGEST_DISABLED_VERSIONS` 和 `INGEST_DISABLED_SCHEMAS` 与数据库列表取并集。改变 Vercel 环境变量后需部署使其生效。降低发送频率用 `minIntervalSec`，需要保留待发数据的临时故障应返回 503，而不要使用会确认丢弃批次的暂停开关。

密码或会话密钥轮换使旧会话失效。收集服务不可用不应影响实例业务；实例队列最多重试七天的行为由实例端实现，此仓库不代替实例队列。

官方参考（2026-11-01 核对）：

- [Cron 用量与定价](https://vercel.com/docs/cron-jobs/usage-and-pricing)
- [WAF 限流](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting)
- [Vercel 项目配置](https://vercel.com/docs/project-configuration)
- [Turso 文档](https://docs.turso.tech/)
