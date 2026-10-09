# 长回答与断线续接候选

状态：未发布开发候选，2026-10-09。不是现有线上服务的能力声明。

## 分工

```text
浏览器提交一次 → 同源 BFF → Provider 持久任务 → IMA
浏览器观看    ← 同源订阅 ← 递增事件日志
手机断线     → 仅关闭观看；重连查询/订阅原任务
明确点击停止 → DELETE 原任务 → Provider 中止本地上游接收
```

网站只连接服务端配置的固定 Provider 地址。普通凭证用于历史；任务走内部服务
凭证和固定 knowledge_agent 合同。浏览器不能提交内部检索字段或上游地址。
新 UI 必须检查受保护容量转译出的 `durableTasksSupported`；缺少能力时报不兼容。

## 同源接口

- `POST /api/qa/tasks`：question、conversationId、UUID requestId，可选 sourceIntent=web。
- `GET /api/qa/tasks`：当前访客任务，可按 conversationId 或 requestId 查找。
- `GET /api/qa/tasks/:id`：任务状态与一致事件快照。
- `GET /api/qa/tasks/:id/events?after=N`：只读续订，15 秒传输心跳，最长 240 秒轮换。
- `DELETE /api/qa/tasks/:id`：明确取消，不表示腾讯已确认停止模型生成。

普通会话 Cookie 归属仍适用。创建任务先持久化再确认；未知提交结果先按原 requestId
查询，不自动提交另一问题。事件连接退出绝不发 DELETE。Vercel 及网关精确放行
上述路径，继续拒绝管理、内部及未知路径。公网频率与待发保护保留，不再独占一路。

## 数据与恢复

Provider 是任务/终态/正文的唯一执行依据。网站私有 task-watch.json 仅存任务路由
及观察状态，用于 BFF 重启后重新观察，不存答案或上游凭证。已有待发问题仍可
编辑/删除；派发后保存 taskId，恢复时只观察该任务，不重新问 IMA。

### BFF recovery contract (FIX-20261009-EXPLORER-TASK-RECOVERY)

- Both submission entry points fsync private request intent before the one-shot
  Provider POST. The record contains the owner routing identity, request ID,
  payload fingerprint, optional queue/task ID and observation state. It contains
  no answer or credentials. Queue drafts retain their existing private storage.
- A dropped response, truncated JSON, 5xx or empty lookup remains `unconfirmed`.
  Restart and duplicate request IDs use GET only, never repeat the POST. An intent
  written just before a process crash may remain unresolved even if no POST left
  the process; this deliberately favors non-duplication over automatic retry.
- Definitive 4xx submit rejection releases the direct lane and retains a rejection
  receipt. Terminal routing receipts also remain private to prevent replay after
  restart. Do not remove unresolved records to make a request runnable again.
- The watch store admits at most 20,000 records. A new `/tasks` or `/queue`
  submission at capacity returns HTTP 429 `task_storage_full` before any Provider
  POST; queued dispatch rechecks before writing submission intent. Existing
  records remain updateable for reconciliation/cancellation, even when an older
  file already exceeds the cap. No active, ambiguous or terminal record is evicted.
  Reaching the cap requires operator intervention; no automatic retention policy
  is provided, and any future archival policy must retain the no-replay identity.
- Cancellation before dispatch does not POST. Once dispatched, queued cancellation
  returns HTTP 202 with `{removed:false,cancelPending:true}`; direct cancellation
  returns HTTP 202 with `{cancelPending:true,taskId}` until Provider confirms a
  terminal result. Cancellation intent survives restart and retries DELETE/GET.
  HTTP 200 `{task}` means Provider confirmed terminal, which may be success if
  completion won the race. It is not proof that IMA stopped remote generation.
- Stream/JSON/snapshot/lookup failures do not terminalize execution. An `error`
  frame is forwarded once; `task.status` or the task snapshot determines failed,
  cancelled or indeterminate. Retained matching history receipts still establish
  success after event expiry. Browser disconnect remains observation-only.
- Public pending capacity is shared across `/tasks`, `/queue`, and legacy ask
  admission. Submitting, unconfirmed and Provider-queued jobs count, even when
  each conversation has its own locally running dispatcher. Only confirmed
  running/terminal tasks release pending capacity. No capacity default is raised.

Synthetic regressions: `node --test test/task-recovery.test.mjs
test/durable-task-bridge.test.mjs test/conversation-turn-queue.test.mjs`.
These short fault-injection tests are not the separate six-minute real-clock proof.

新任务无 180/190 秒总执行截止。观察连接轮换不是任务完成；只有明确上游成功才
显示完成。上游错误、进程退出或缺少终态不会冒充成功。Provider 进程重启不能
恢复已派发的 IMA 生成，只能诚实标记结果不确定，禁止自动重问。

## 隔离验收命令

```sh
npm ci
npm test
npm run build
# 指向已审查的隔离 Provider 源码，不指向运行中账号目录。
SYNTHETIC_PROVIDER_SOURCE=/absolute/path/to/provider-candidate \
  node scripts/verify-durable-chain.mjs
```

默认 370 秒真实时钟合成链路，通过实际 Provider 应用、BFF、预览网关和 Vercel
函数代码；仅将公网隧道跳点替换为本机网关，禁止真实 IMA。结果不能证明实际
Vercel/ngrok 网络、真机软键盘或真实长回答已通过。短测可设置
`SYNTHETIC_DURATION_MS=1500`，但不能替代六分钟验收。

Docker 另用 `deploy/docker/compose.durable-test.yaml`，独立 Compose 项目及独立
合成卷，Provider/BFF 网络禁止外网，只注入假上游，绝不挂载真实运行目录。
先串行构建本候选与 Provider 候选镜像，再显式设置 `PROVIDER_TASK_IMAGE`、
`WEBSITE_TASK_IMAGE` 和 `SYNTHETIC_SCOPE`（synthetic-kb 的 SHA-256）。从
`docker compose -f deploy/docker/compose.durable-test.yaml -p <专用测试项目> port gateway 8080`
取得本机临时端口，用 `SYNTHETIC_WEBSITE_URL=http://127.0.0.1:<端口> node scripts/check-durable-docker.mjs`
验证重连、幂等冲突、归属、表格、历史、停止和管理封锁。不得对现有部署执行此测试配置。

发布前还须整合任务调度分支、Node/Docker 回归、浏览器桌面/手机模拟，记录固定
提交与镜像。4318 接入共享 Provider 前重新确认维护窗口并保留机器人扩展。
真实 IMA 长问题/追问另行授权。4317、机器人和公网入口不会因合并候选自动更新。

回退先关闭新提交并排空 Provider 活动任务；保留任务日志、会话和账号目录。
只切换兼容代码，不用旧备份覆盖新数据，不以关闭浏览器或 BFF 健康检查代替排空。
