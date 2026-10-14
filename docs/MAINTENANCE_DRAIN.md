# 网站私有维护排空（候选）

仅由安装维护者在明确授权窗口执行。此文描述候选源码，不表示 4317、4318、4417
或 3117 已部署、迁移或切换。本次只验证合成数据；不导入运行目录、凭证或真实问题。
Bot 热 maintenance 已由集成维护者另行核验启用；网站排空仍须逐实例独立证明，不能
用 Bot 或 Provider 的健康状态代替。本文不要求为暂停 Bot 走 legacy 重启。

## 配置边界

`DEMO_MAINTENANCE_STATE_PATH` 只从服务端环境或私有 `.env.local` 读取；CLI 只读取
同名环境变量，不接受 `--path`、浏览器 query/body/header 或任意公网配置。
未配置时默认 OPEN，保持原行为。配置后文件缺失、JSON/schema 非法、权限不安全、
同进程观察到代际回退均 fail closed。路径本身不安全则启动拒绝，不会以 OPEN 启动。

必须使用项目之外的绝对规范路径（无符号链接），直接父目录属于服务进程的有效
UID 且权限恰为 0700；文件须为同 UID 的 0600 普通文件、单硬链接、最多 16 KiB。
项目树、构建目录、含 `.git` 或 `package.json` 的祖先目录内均拒绝。POSIX UID/
权限是本合同的一部分，Windows 原生未验证。CLI 必须以同一 UID 执行。

每个 BFF 独占一个目录/路径，绝不能让 4317、4318、4417 共用 state。Docker 必须
为容器内 node UID 准备外置私有挂载，并在容器内用同一规范路径执行 CLI；不要
把容器 PID 快照拿到宿主 CLI 作为存活证明。不修改现有 Compose 或自动创建挂载。
初次启用配置需要正常安装窗口；启用后的 close/check/open 无需重启。

### 首次安装不是热排空

现有旧版没有这个 gate，也没有覆盖 HTTP 收 body、准入检查等阶段的完整计数。
`deploy/release-config.mjs` 的 idle 检查只能作为辅助观察，不能证明检查后没有新
请求进入。`deploy.sh stop` 会停止整套 Compose；停止 gateway 可能中断既有 SSE。
不得用这些命令冒充“只拒绝新提交、无损保留现有回答”的热开关。

首次安装须单独确认短暂停机窗口及未完成请求的处置。先提示暂停使用，尽力等待
既有回答完成，保留历史和全部待发消息；如不能证明所有入口持续拒绝新提交及
所有在途工作为零，必须明确说明仍可能发生中断，不能承诺无损。未得到这一
安装边界的授权就停止实施，不把上游队列一时为空当成授权或排空证明。

新实例须以独立、预初始化的 CLOSED 状态启动。恢复的待发项保持 paused，由原
所有者处理；不删除队列、不自动重发中断回答。确认 writer、代际与新鲜快照后
才能使用本文的后续维护流程。首次安装不顺带重启 Provider 或机器人，也不构成
账号迁移授权。

## 授权操作模板

在已审查的源码或 dist 目录执行。下例路径和 operationId 均为占位示例，不是当前
运行配置。先创建属于服务 UID 的外部 0700 目录，不要移动/读取已有运行数据。

```sh
export DEMO_MAINTENANCE_STATE_PATH=/ABS/PRIVATE/BFF-INSTANCE/maintenance.json
# 首次配置：只允许用 close + generation 0 初始化缺失文件。
node scripts/maintenance.mjs close --generation 0 --operation-id maintenance-example-001
# 配置 BFF 使用同一路径；初次安装启动后，先 check。
node scripts/maintenance.mjs check
# 维护完成再 open；使用 close 返回的 generation 和同一 operationId。
node scripts/maintenance.mjs open --generation 1 --operation-id maintenance-example-001
# 下次窗口：使用当前实际 generation，且换一个新的 operationId。
node scripts/maintenance.mjs close --generation 2 --operation-id maintenance-example-002
node scripts/maintenance.mjs check
node scripts/maintenance.mjs open --generation 3 --operation-id maintenance-example-002
```

不能照抄示例代际到现有实例。close/open 在私有独占锁下比较 generation，递增后
原子 rename/fsync；open 必须绑定当前 CLOSED 的 operationId。重复、过时代际或
冲突请求拒绝，不强行覆盖。发生不确定结果先 check，不盲目递增或重放。

check 返回私有 JSON：state、snapshot、drained。退出码 0 表示已观测 CLOSED 且
全部工作为零；2 表示快照有效但 OPEN 或尚有工作；1 表示不能证明（状态非法、
实时 IPC 超过 2 秒、代际改变、写入者不匹配或进程不存在等）。控制文件更新
不等于 BFF 已确认；等待对应 generation 的 check 成功，不能只看 close 的退出码。
check 通过同 UID 私有 Unix socket 按需读取实时计数，不再定时写入快照。查询前后核对维护代际与 writer，响应绑定随机请求标识；证明仅对该观察时刻/代际有效，不是永久维护授权。

## 入口与计数

CLOSED/ERROR 只拒绝新的 POST `/api/qa/ask`、`/api/qa/queue`、
`/api/qa/conversations`（含已配置的 URL 前缀），在入队/上游调用之前固定返回
503、`Retry-After: 30` 和 `{"error":"问答服务维护中，请稍后重试。"}`。
不公开 operationId、路径、计数或状态详情，不新增公网 admin API。
Vercel 与 preview gateway 仅透传 Retry-After，白名单不开放维护文件/脚本。

已准入请求、既有 SSE 和 queued 自动派发继续；读取、编辑、取消/删除保持原合同。
先关闭所有 consumer 的新提交，再让各 BFF 和 Provider 完成已有工作，不能提前
停 Provider 或撤销凭证。维护完成、Provider 验证通过后再逐实例 open。

私有 snapshot 字段定义：
- `inflight`：已准入的新 ask/enqueue/create HTTP handler，直到异步处理 finally 完成。
- `activeDirect`：直连回答占用的 lane；`running`：已经启动的队列 job（含等待 preview slot）。
- `queued` / `paused`：尚未运行项；`pending` 为二者之和。
- `expiredPending`：超过原一小时 TTL 的 pending 子集，不从统计中忽略。
- `previewActive` / `previewWaiters`：preview 串行槽占用数和等待者数量。

这些是不同层级的精确计数，有重叠，不得相加解释为请求总数。读取请求不是问答
工作，不计 inflight。drained 要求上述各项全部为零且模式为 CLOSED。断流后的
上游取消和 finally 清理完成前仍不宣称排空；前端关页不等于后台立即归零。

## Paused、过期与恢复

维护 preserve 模式在恢复前校验整份队列文件。无效 UTF-8/JSON、非数组根、
非普通文件（包括符号链接）、异常行、重复 id 均拒绝启动，不跳过、不合并、
不回写原文件。异常信息不包含问题或所有者。只有初次检查文件不存在才允许
视为空队列；已发现文件后读取失败不会退回空队列。JSON 解析失败和非数组根
在原 legacy 模式也已拒绝，并非本次才修复的空队列 fallback。

每行必须完整匹配当前 save 格式：id、owner、conversationId、requestId、question、
sourceIntent、preview、createdAt、status。拒绝缺失/未知字段、无效类型、空身份字段、
空或超长问题、非法时间、未知 intent/status；不猜测或补默认值修复历史格式。
合法 queued/paused/running 仍统一恢复为 paused，保留过期待发内容。
旧格式若不符合该合同，维护者必须先离线审查处理，不能删除文件伪造空队列。

队列加载早于维护 writer 启动，因此异常存储不会生成新的 drain 快照/租约。
旧 snapshot 文件不作为证明；必须完成实时 IPC、代际和存活 writer 检查。
该校验只在配置维护时启用；未配置时原有跳过异常行、重复 id 覆盖和 TTL 行为
保持兼容。此候选不自动转换或清理任何运行存储。

启用维护配置后，待发 TTL 不再静默删除：过期项保留为 paused，并阻止同 lane
后续项越过；重启载入的 pending 同样保留并 paused。open 不自动恢复 paused，
没有新增 resume API。使用原所有者会话读取/取消/删除待发项，或等待另行授权的
人工处置；无法取得所有者会话时报告阻塞，不编辑私有队列文件伪造 drained。
删除最后一个 paused 后也不承诺自动启动其它停住的 queued，必要时逐项处理。
未配置维护时保留原 TTL 行为。回退/取消配置前先处理保留项，旧代码会按 TTL 清理。

`state.lock` 是短期 CLI 写锁，`state.writer/owner` 是 BFF 单写入者租约，
实时响应只含计数和本机进程标识，不含问题或凭证。Unix socket 位于系统临时目录下同 UID 的 `ztx-maint-<uid>` 私有短路径目录（0700），socket 为 0600；文件名由规范状态路径和实例标识散列生成，支持 macOS/Linux。旧 `state.snapshot` 不再更新或读取。崩溃遗留锁不自动抢占。
维护者必须先确认对应 CLI/BFF 已退出，再清理遗留锁/租约并正常启动；不得删除
仍运行进程的 writer。不要删 state 来解锁：缺失 state 会关闭新提交。
权限/损坏修复须在外部私有目录内进行，保留最后可信代际；同进程拒绝代际回退。

## 合成验证

`node --test test/maintenance-gate.test.mjs test/maintenance-api.test.mjs test/maintenance-storage.test.mjs`
覆盖权限/链接、非法配置、代际 CAS、写入者、新提交拒绝、既有 queued 排空、
preview 等待者、SSE 断流清理、paused/过期保留及原所有者删除。
另运行 gateway/Vercel 测试确认固定拒绝响应头可达公网；不发真实问题。

## 实时检查升级与回退

`checkMaintenance` 现在返回 Promise；CLI 的 JSON（state/snapshot/drained）和退出码 0/2/1 保持兼容。更新所有导入该函数的宿主管理脚本，使用 `await`，否则不能判断排空。新 `deploy/macos/control.mjs` 同时支持旧同步 gate 和新版异步 gate。

在旧 gate 下先完成排空，保留维护状态和私有 writer 记录，再停止 BFF。一起更新 BFF 与控制工具，新 BFF 保持 CLOSED；验证实时 check 成功后再开放。回退同样先用当前工具证明排空，停止后恢复成对代码与工具，保留最新状态/队列，不恢复旧历史备份。socket 最多接受 8 个并行连接，帧最多 16KiB，连接与查询均有 2 秒截止；关闭后的旧实例不能认证排空。
