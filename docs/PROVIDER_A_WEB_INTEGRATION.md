# 自定义网站接入 Provider A

网站后端连接 Provider A，本项目的 `server.mjs` 和 `provider-a-client.mjs` 是可运行的最小示例。浏览器只调用同源 `/api/qa/*`；它不会持有 Provider A 凭证、知识库 ID 或内部请求键。

## 最短路径

1. 启动已经接入账号的 Provider A，确认其版本支持 `knowledge_agent` 流式内部接口，且 `GET /internal/provider-a/capacity` 中 `policies.knowledge_agent.max_concurrent > 0`。
2. 在网站后端的私有 `.env.local` 中配置 `PROVIDER_A_BASE_URL`、普通 `PROVIDER_A_API_TOKEN`、独立 `PROVIDER_A_INTERNAL_SERVICE_TOKEN`、`PROVIDER_A_KNOWLEDGE_SCOPE_REF` 和独立的 `DEMO_COOKIE_SECRET`。知识库范围是目标知识库 ID 原文的 SHA-256 十六进制摘要，不是知识库 ID。与 Provider A 同机时可用 `npm run configure:local -- --provider-env /私有配置路径` 自动写入；脚本会生成并保留 Cookie 密钥。
3. `npm ci`、`npm test`、`npm start`。打开 `http://127.0.0.1:4317/`，用 `npm run verify:real` 显式完成一问一追问验收。

远程机器先建立 SSH 本地端口转发，并把 `PROVIDER_A_BASE_URL` 设为本机隧道地址。服务仅接受 `127.0.0.1` 地址，避免把受保护的 `/internal/` 接口直接暴露到公网。

## 请求边界

| 用途 | Provider A 接口 | 凭证 | 浏览器可见 |
| --- | --- | --- | --- |
| 会话创建、列表、详情、删除 | `/api/conversations` | 普通 API token | 仅网站同源代理 |
| 原生知识库流式问答 | `/internal/provider-a/deep-ask` | 内部服务 token | 仅网站后端代理 |
| 模式容量 | `/internal/provider-a/capacity` | 内部服务 token | 仅脱敏容量摘要 |
| 账号管理 | `/api/admin/*` | 管理员 token | 不由网站后端代理 |

网站后端用签名的 HttpOnly Cookie 标识演示用户，向 Provider A 传稳定的 `X-IMA-Client-Id`；正式站点应使用自己的登录用户 ID。首问与追问使用同一 `conversationId`。每次提交生成一个 UUID，后端在私有 `runtime/` 中按用户和 UUID 记录不可逆的请求指纹；重复或断流后重试返回冲突，不会再次向 IMA 派发。当前常驻 Provider A 的内部流式接口要求 64 位 `Idempotency-Key`，后端由用户标识和 UUID 稳定派生该键。公开候选的旧内部接口却拒绝带键 SSE；升级它以前，不能宣称公开版兼容此真实模式。已有旧模式会话可读，继续提问须新建会话。

问答请求的服务器字段固定为 `retrieval_policy: knowledge_agent` 和部署者知识库的 `knowledge_scope_ref`。响应是 SSE：`conversation` 给出会话，`sources` 给出精选来源，`delta` 增量追加正文，`done` 为唯一成功终态，`error` 为失败。断流、取消、没有 `done` 或重复 `done` 均不能显示“回答完成”；断流后已收到的文字可以保留并标记未完成。网站后端不自动重试已经派发的问答。

`/api/qa/health` 只读取健康、普通鉴权和内部模式容量。`connected` 说明进程可达，`authenticated` 说明两类凭证可用，`ready` 说明原生 Agent 容量大于零，`lastRealSuccessAt` 是当前网站进程完成真实带来源问答的时间。只有显式真实提问才能更新最后一项。

## 发布边界

公开 v0.3.0 的接口与本机常驻 Provider A 的原生 Agent 流式契约不同。此示例要求支持该契约的 Provider A 版本；不能仅复制网站示例就让 v0.3.0 获得新能力。公开发布候选须连同对应 Provider A 实现、测试、升级和回退说明一起审查。微信平台收发、群上下文和机器人部署不属于网站示例。
