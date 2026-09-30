# 自定义网站接入 Provider A

网站后端连接独立部署的 Provider A，本项目的 `server.mjs` 和 `provider-a-client.mjs` 是品牌应用适配层。浏览器只调用同源 `/api/qa/*`；它不会持有 Provider A 凭证、知识库 ID 或内部请求键。公开 Provider A 的可运行通用示例见 `examples/web-bff`，两套页面不共享运行数据。

## 最短路径

1. 使用公开 tag `v0.4.0` 的 Provider A，确认受保护的 `GET /internal/provider-a/capacity` 返回 `schemaVersion: 1`、`features.knowledge_agent_keyed_sse_v1: true`，且 `policies.knowledge_agent.max_concurrent > 0`。后续兼容补丁也须保持该合同；旧版即使显示账号容量也不能作为本网站的问答后端。
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

网站后端用签名的 HttpOnly Cookie 标识演示用户，向 Provider A 传稳定的 `X-IMA-Client-Id`；正式站点应使用自己的登录用户 ID。首问与追问使用同一 `conversationId`。每次提交生成一个 UUID，后端在私有 `runtime/` 中按用户和 UUID 记录不可逆的请求指纹；重复或断流后重试返回冲突，不会再次向 IMA 派发。后端由用户标识和 UUID 稳定派生 `Idempotency-Key`。本应用在启动和新问答派发前检查带键流式合同；缺失时仍可查看页面和已有历史，但新问答和新排队返回固定的不兼容错误。已有旧模式会话可读，继续提问须新建会话。

问答请求的服务器字段固定为 `retrieval_policy: knowledge_agent` 和部署者知识库的 `knowledge_scope_ref`。响应是 SSE：`conversation` 给出会话，`sources` 给出精选来源，`delta` 增量追加正文，`done` 为唯一成功终态，`error` 为失败。断流、取消、没有 `done` 或重复 `done` 均不能显示“回答完成”；断流后已收到的文字可以保留并标记未完成。网站后端不自动重试已经派发的问答。

`/api/qa/health` 只读取健康、普通鉴权和内部模式容量。`connected` 说明进程可达，`authenticated` 说明两类凭证可用，`ready` 说明原生 Agent 容量大于零，`lastRealSuccessAt` 是当前网站进程完成真实带来源问答的时间。只有显式真实提问才能更新最后一项。

## 发布边界

v0.3.1 及更早版本的接口与本应用要求的原生 Agent 流式契约不同；不能仅复制网站代码让旧版获得新能力。本仓库固定记录已发布的 Provider A v0.4.0 tag，但维护者尚未在隔离授权账号上完成该 tag 的真实 IMA 复验。运营者按本指南验收后只记录日期、版本和脱敏结论；不得提交真实问题、回答或来源。网站发布仍需另行审查身份、原型 `/admin`、私有运行数据与反代。微信平台收发、群上下文和机器人部署不属于网站应用。
