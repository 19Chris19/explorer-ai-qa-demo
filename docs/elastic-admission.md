# 知天下配套弹性调度（本地候选）

分支 codex/elastic-website-admission-20261019，基线
8e1f0016a2940e56674e584e231108cb1e599b8e（v0.4.4）。
配套 Provider 分支 codex/elastic-account-scheduling-20261019；最终提交和摘要见联合交付清单。

调用链仍是浏览器 → Vercel → 本机 BFF → 本机 Provider → IMA。
账号分配、验收额度、发起节奏、增减窗和应用公平调度只在 Provider 执行。
本分支不安装第二套账号池，不更换 Cookie 签名或服务凭据，不修改生产 Vercel 配置。

## 网站行为

- 原容量接口新增 allocation 时，网站校验字段并采用该应用的额度、活动数及等待数；
  缺失时兼容已发布 Provider，格式不合法时拒绝乐观放行。
- 命名应用用普通 /api/capabilities 与内部容量接口的 applicationId 核对同一应用。
  不匹配则不就绪；legacy 角色仍兼容，并明确 isolationVerified=false。
  不以客户端请求头、网站展示名或联网能力声明作为应用身份。
- 同一会话仍串行；不同会话可以并行。容量满时等待，不把等待说成正在生成正文。
- 队列、取消、SSE 断线恢复及历史仍使用原任务 ID / requestId。
  提交超时保留“待确认”，查询原任务，不自动创建第二个问题。
- 暂停当前应用额度（maxConcurrent=0）或配额结构损坏时，新请求拒绝受理；旧任务仍可查询。

## 可配置保护

全部使用私有运行配置，默认不变：

| 参数 | 默认 | 含义 |
| --- | --- | --- |
| DEMO_PREVIEW_MAX_SUBMISSIONS | 10 | 每访客每窗口的新提交数量 |
| DEMO_PREVIEW_WINDOW_MS | 60000 | 提交频率窗口 |
| DEMO_PREVIEW_MAX_PENDING | 8 | 公开入口未确认/等待额度，与执行并发不同 |
| DEMO_MAX_PENDING_PER_CONVERSATION | 3 | 单会话待发问题数 |
| DEMO_PREVIEW_MAX_RECENT_RECORDS | 10000 | 内存频率记录总上限，满时拒绝新键；原键查询不加费 |
| DEMO_PROVIDER_SUBMIT_TIMEOUT_MS | 60000 | 提交及任务状态请求超时 |
| DEMO_LEGACY_ASK_TIMEOUT_MS | 190000 | 兼容流式问答连接超时 |

范围在 qa-admission-config.mjs 中校验；启动时拒绝非法值，不在日志回显输入值。
待发数不会自动变成 100。Provider 的账号额度、应用额度、全局队列，以及网站的访客
限流与待发限制共同生效。权重在 Provider 调整，BFF 不复制一套权重算法。
只读健康信息提供 admission 与经过白名单投影的自身 allocation，无账号映射或其他应用信息。

## Vercel 和部署

继续使用现有路径与流式代理，不新增公网端口或管理入口，不将 Provider 密钥发给浏览器。
Vercel 单条代理配置仍为 300 秒；长队列和回答超过连接寿命时依靠同一持久任务的 GET 恢复，
不能靠重发 POST 延长。不能将单次 HTTP 连接寿命当作任务寿命。
新增 qa-admission-config.mjs 已纳入本机 dist 和 Docker 源码复制路径。

正式上线另行授权：先排空/备份，更新本机 Provider（弹性先关闭），再更新本机 BFF 与
Vercel 配套制品；核对两仓 SHA 和资源摘要后，仅开启已验收范围。默认配额不自动放大。
回滚关闭 Provider 弹性及应用调度，恢复固定网站制品；不回退已续期凭据、Cookie 签名或历史。
Air 机器人不在本轮启用或迁移范围。

## 合成测试

Node 22 下执行 npm test 和 npm run build。
完整联合链路需显式设置 PROVIDER_SCHEDULING_ROOT=/path/to/paired/provider 后执行 npm test。
否则联合测试明确跳过，不能算作联合验收通过。
联合测试使用两仓实际代码、隔离临时存储和模拟上游，覆盖网站/Agent 争用、SSE、
排队取消、同会话追问、BFF 重启后的历史读取和原键查回，不连接 IMA。
真实 Provider/BFF 五路及更高并发、跨模式与长期资源验收仍待单独确认。


本地交付检查：本仓 371 项通过、一项仅候选安装器适用的检查跳过；其中实际两仓联合
测试已提供配套目录并通过。构建、资源体积预算与发行隐私检查通过。Provider 本次
981 项通过、两项 365 秒长时钟检查跳过。详情见 elastic-acceptance-20261019.json。
这些数字不代表真实问答、容器镜像或手机真机验收；本轮没有上线。
