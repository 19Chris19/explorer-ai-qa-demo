# AI 问答演示项目交接

> 此文保留另一台 Mac 导出时的事实与计划。Air 本机的当前启动方式和验收状态以 [README.md](README.md) 为准。

## 1. 导出范围与 Git 状态

- 原项目位于另一台 Mac 的本地问答前端工作区；个人路径不随交接包保留。
- 导出时间：2026-09-23；从**当前工作区文件**复制，包含未提交的前端、服务端、测试和文档。
- 原仓库当前分支：`main`；尚无任何提交，`HEAD` 不存在；没有配置 Git 远端。交接时所有源文件均未跟踪，未有已暂存或已修改的跟踪文件。被忽略的私有 `.env.local` 未导出。
- 此 ZIP 没有 `.git`；接收方可在自己的项目目录新建 Git 仓库或将源码迁入团队提供的主站功能分支。不要把这个无历史的演示仓库当作主站共同祖先直接合并。
- 包中 `package-lock.json` 和 `scripts/build.mjs` 是**仅在导出副本中**补齐的交接工具；原项目未被改动。构建产物 `dist/` 不在 ZIP 内。

## 2. 安装、启动、构建与测试

要求 Node.js 20 或更高版本、npm。当前没有第三方运行依赖。

```sh
npm ci
npm test
npm run build
npm start
```

开发时可用 `npm run dev` 自动重启。默认只监听本机 `127.0.0.1:4317`；打开 `http://127.0.0.1:4317/`。构建脚本将静态资源、服务端入口、清单和占位配置复制到 `dist/`；如需运行构建结果，先在 `dist/` 中**另行**配置私有 `.env.local`，再执行 `node dist/server.mjs`。构建不会复制任何凭据。

只预览页面与运行模拟测试，无须接入 Provider A。真实问答需在接收方机器重新取得授权：建立本机到 Provider A 的私有隧道，把**普通** API token 写到项目根目录 `.env.local`（权限 `0600`，Git 忽略），再重启服务。示例见 `.env.example`；将其中占位符替换为接收方自己的本机隧道端口与普通 token。不要把 token 放入浏览器、命令行参数、Git 或日志，也不要沿用导出机器的 SSH 私钥。演示服务不使用管理员 token。

`npm test` 只启动本机假 Provider A，不会登录 IMA 或发起真实问答。`scripts/verify-provider-a.mjs` 是**手动**真实串行验收工具，必须在新环境得到授权并完成私有配置后使用；它会创建会话并最多发送首问、追问，因此不属于常规构建或测试。

## 3. 页面与交互

- `/`：左侧主站式导航、会话历史、新建/切换/删除会话、建议问题、流式回答、来源按钮、停止生成、连接状态、移动端历史抽屉。Enter 发送，Shift+Enter 换行。
- `/admin`：总览、Provider、知识库、运行维护、成本五个信息架构面板。A 的连接、队列和容量快照来自健康接口；B/C、告警、成本和管理动作均为静态规划内容。此页**没有**管理员鉴权，不能直接作为生产管理后台。
- 浏览器只调用同源 `/api/qa/*`；`server.mjs` 是本地 BFF。回答正文和来源来自 Provider A 的流式事件，前端没有内置真实问答内容。

## 4. Provider A 接口契约

| 浏览器调用 | BFF 上游调用 | 主要用途与请求字段 |
| --- | --- | --- |
| `GET /api/qa/health` | `GET /healthz` | 连接、Provider、队列与容量快照；无需上游 token |
| `POST /api/qa/conversations` | `POST /api/conversations` | 创建会话，请求体 `{}`；读取返回的 `conversation.conversationId` |
| `GET /api/qa/conversations` | `GET /api/conversations?limit=50` | 当前客户的会话列表 |
| `GET /api/qa/conversations/:id` | `GET /api/conversations/:id` | 会话与历史消息 |
| `DELETE /api/qa/conversations/:id` | `DELETE /api/conversations/:id` | 删除当前客户的会话 |
| `POST /api/qa/ask` | `POST /api/ask` | JSON `question`，追问时带同一个 `conversationId`；`Accept: text/event-stream` |

普通会话与问答请求由**服务端**添加 `Authorization: Bearer <普通 API token>` 和 `X-IMA-Client-Id`。演示 BFF 为每个浏览器生成独立、带签名且 `HttpOnly` 的匿名 Cookie，以保持客户 ID 稳定；不接受浏览器自报的客户 ID。轮换 API token 会使现有签名失效。正式接入主站时应改用已登录用户的服务端身份映射，而不是继续使用匿名 Cookie 作为权限边界。

上游 SSE 格式为 `event: <类型>\ndata: <JSON>\n\n`。前端处理 `conversation`（会话 ID）、`sources`（来源）、`delta`（文字片段）、`done`（成功终态）、`error`（失败）。只有收到 `done` 才可判该轮成功；网络中断或只有部分 `delta` 不等于完成。停止按钮会中止当前浏览器请求。BFF 不调用 Provider A 管理接口。

## 5. 已验证、尚未验证与遗留问题

- **本机模拟通过**：`npm test` 验证 BFF 不把 token 放入页面，向假 Provider A 传同一客户身份，并将两轮假 SSE 事件转发给浏览器侧调用者。此测试不证明真实 IMA 问答质量。
- **真实连通已验证**：导出机器经既有隧道请求 Provider A `/healthz` 返回 200；服务端健康代理显示连接与普通 token 配置到位；直接调用 `POST /api/conversations` 已成功创建会话。
- **真实问答未通过**：一次跨机首问在收到 `conversation` 后返回 SSE `error`，未收到 `sources`、`delta`、`done`；按约定停止，未发送追问或自动重试。具体上游子类别尚不明确。ZIP 不包含原始回答、来源、会话 ID 或运行记录。
- **未实现**：B/C Provider、自动故障转移、跨 Provider 上下文迁移、正式管理员权限与审计、真实用量/成本、主站登录与路由集成、生产级持久化及高可用。
- **已知风险**：健康 200 不代表问答可用；A 的可调度容量需以实时策略和实际成功问答核对；匿名 Cookie 仅适于本地演示；正式后台不能暴露在无鉴权的 `/admin`；来源可能因权限或外链失效打不开；中途断线不能静默拼接不同 Provider 的半段回答。

下一步先由获授权的 Air 维护者查明该 SSE `error` 的上游类别，之后在新环境做同一客户身份、同一会话的串行首问与追问验收，检查相关来源、文字、成功 `done` 和上下文衔接。再把页面与 BFF 迁入主站团队提供的功能分支，对接真实登录身份、统一设计规范与现有管理后台。接入前在团队仓库先完成代码审查、配置交接和回滚方案。

## 6. 包内文件与排除项

`public/` 是完整页面源码；`server.mjs` 是本地 BFF；`scripts/` 有构建、隐式录入普通 token 和手动真实验收脚本；`test/` 是模拟测试；`docs/` 保存需求、架构、阶段计划及不含实际账号池数据的运维方案。

本包不含 `.git`、`node_modules`、`dist`、缓存、`.env.local`、SSH 密钥、凭据、真实 Cookie、账号资料、真实问答记录、运行日志或截图。任何本地配置和授权都必须在接收方环境重新建立。
