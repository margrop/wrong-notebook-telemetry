# 本地验收记录

日期：2026-11-01。环境：macOS arm64，Node.js 26.10.0，npm 11.19.1。验证范围为本地代码与生产构建，不代表外部平台已部署。

## 已验证

- `npm ci --registry=https://registry.npmjs.org` 可在独立临时副本安装依赖。
- 基础收集、维护控制、私有看板三个提交分别在独立副本通过对应完整 CI，能够独立构建与测试。
- `npm run ci` 通过：公开文件检查、生成 Prisma Client、Lint 零警告、单元/集成测试、生产构建、TypeScript 与生产 HTTP 冒烟。
- 最后补充满 100 条事件、满 100 条错误及混合批次的测试，覆盖多行 upsert 的 900 参数边界；当前合计 43 个单元测试和 25 个真实 libSQL 集成测试通过。
- 生产 HTTP 冒烟确认：数据库就绪、未登录页面保护、签名 Secure Cookie 登录、批次接受/拒收、数据库真实计数、统计渲染、错误状态与服务参数写入、Cron 执行、退出登录。
- 独立验证密码工具：终端输入隐藏、bcrypt 校验正确、输出的转义配置经 Next.js 环境变量加载后保持完整。
- `npx prisma validate` 通过；迁移测试验证重复执行保留数据、校验和异常拒绝。
- `npm audit --omit=dev --json --registry=https://registry.npmjs.org`：运行时依赖已知漏洞为 0。
- 合成数据与测试凭据仅用于系统临时目录，HTTP 冒烟结束后关闭服务器并清理数据库。

## 外部验证边界

- 未创建或连接真实 Turso 库、未创建 Vercel 项目、未修改 DNS、未推送远程，也未与实例端队列联调。
- 尚未验证真实 Turso 网络延迟，不能把本地耗时当成远端性能。多行 upsert 将混合批次的聚合写语句限制为最多四条，以减少网络往返。
- gitleaks 已配置到 GitHub CI；本地官方 release 资源下载超时，因此未运行 gitleaks。公开前仍应执行完整密钥扫描，不能以文件检查替代。
- Node.js 22 的 GitHub CI 已配置；本轮实际本地执行版本为上面记录的 Node.js 26。

上线验收按 [部署文档](DEPLOYMENT.md) 执行，重点确认生产/预览库隔离、真实 HTTPS、平台限流、Cron 实际执行结果和实例队列行为。
