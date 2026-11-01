# AGENTS.md

- 回复、注释和提交说明使用简体中文，提交格式为 `<type>: <中文描述>`，不添加 AI 署名。
- 此仓库是独立的匿名统计收集服务，不修改错题本实例代码，不接收用户或实例标识、错误原文、题目或 AI 对话。
- 架构、协议兼容性与隐私边界见 `doc/SERVER_DESIGN.md`；变更协议时同步契约向量与测试。
- 使用 TypeScript 具体类型和 `unknown`，类型导入用 `import type`；数据库走 Prisma 参数化查询。
- 日志只记录固定错误码，不输出异常对象、请求头、请求体、密码或数据库连接信息。
- 界面文本集中于 `src/lib/translations.ts`；组件保持精简并适配移动端。
- 安装依赖指定官方 registry，锁文件不得包含 npmmirror。
- 修改逻辑后运行 `npm run test:unit && npm run test:integration`，Lint 零警告。完整验证运行 `npm run ci`，其中包含生产构建与真实 HTTP 冒烟。
- 正式迁移只能追加到 `prisma/migrations/`，同步 Prisma schema；通过 `npm run db:migrate` 执行，禁止清库或自动在构建阶段迁移。
- 密钥只放本地 `.env.local` 或平台环境变量，不提交数据库、真实统计、导出、截图和 `.vercel/`。
- 临时文件使用系统 `mktemp` 目录；测试必须使用临时 libSQL 数据库，不访问生产库。
- 功能与配置变化同步更新中英文 README、设计与部署文档。此服务尚无对外发布时，不替实例应用或官网宣称遥测已上线。
- 本地提交无需再次确认；未获明确要求不创建远程仓库、不推送、不部署、不修改 DNS。
- 新工作副本执行 `git config core.hooksPath .githooks`；公开前运行文件检查与 gitleaks。
