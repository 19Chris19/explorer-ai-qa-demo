# 知天下 Agent 部署

## 当前稳定版本与任务协议

2026-10-16 核对：当前稳定版本为网站 **v0.4.2** 与 Provider **v0.6.2** 的
`durable_qa_tasks_v1` 配对。Agent 先核对 GitHub 非预发布 Release 及附件；若
尚未发布，停止本次目标安装，不把 main 当作已发布版本。
本版本命令从 `deploy/bundle.env` 读取稳定配对，旧 RC tag 保留为历史测试版。
检查能力字段；缺失就停止，不能自动降级直连 SSE。
详见 [任务边界与验收](DURABLE_TASKS.md) 和 [预发布升级](PRERELEASE_UPGRADES.md)。
部署说明本身不是修改现有 Air 服务或账号的授权。

## 状态和关系

**已有服务换主机不是新安装。** 2026-10-12 Air → M1 Max 完整恢复已保留登录态、网站签名、归属及任务记录，并完成公网真实首问／追问；见[迁移记录](HOST_MIGRATION_20261012.md)。这不是新账号扫码或跨平台免扫码验收。已收到迁移包时先按固定代码和私有清单恢复，不执行下面的 `init`，不以 main 覆盖兼容补丁，也不先启动第二个账号续期端；停旧与切换授权是启动前提。

只读迁移历史与 Air host gateway 属于已有安装的高级维护能力，见
[迁移历史协议](MIGRATION_HISTORY.md)，不是新用户独立安装必做步骤。
实际导出、机器人扩展审计和服务切换须在单独授权的维护窗口执行；不要复制 Air
账号或运行数据。历史本机迁移记录不等于新部署已迁移或已完成真实问答。
[维护排空](MAINTENANCE_DRAIN.md)需逐实例配置，不自动修改现有安装。

**本版本固定 v0.4.2 / Provider v0.6.2。** 两仓须有对应稳定 Release 和镜像清单，不能部署浮动 main。已有安装不会自动更新。Agent 必须核对配套版本、镜像权限及各平台尚未验收项。

```text
浏览器 → 同源 Nginx → 知天下 BFF → 私有容器网络 Provider A → IMA
维护电脑 → 专用 Chromium / SSH 隧道 → Provider 管理接口 → 服务端加密账号库
```

知天下不保存第二份 IMA 登录实现。统一工具由公开 Provider 仓库交付；本仓库只负责网站配置、私有镜像和知识库预设。扫码和授权必须由人完成。

默认从本仓库一次部署独立双服务，不依赖 Air 或已有机器人。配套 tag 来自 `deploy/bundle.env`，安装记录固定实际镜像摘要与源码；候选必须显式指定审查过的 Provider 源码与两边镜像。详见 [部署模型](DEPLOYMENT_MODEL.md)。只有明确选择 [高级接入](ADVANCED_DEPLOYMENT.md) 时才共用既有 Provider。

## 可复制提示词

> 请先阅读本仓库 README 与 docs/AGENT_DEPLOYMENT.md，再问我选择：①直接在线体验，不安装；②只部署网站并借用获批共享 Provider；③完整独立部署，使用自己的账号。支持原生选项时用原生界面，否则列出编号并等待回答。共享服务未开放或未获批准时停止该路线，不使用维护者公共凭证。独立部署选择最新已发布稳定版本与配套 Provider，优先 Docker。先检查系统、架构、Docker/Compose、端口、已有安装及私有仓库／镜像权限；缺少 Docker 时说明并等待授权，从官方渠道安装。用仓库引导命令，不输出凭证，不覆盖配置、账号、会话或卷，不开放管理／内部接口。默认知识库为“3DGS 知识答疑”；Linux 服务器先确认维护电脑与 SSH。需要扫码、手机确认、加入知识库、系统授权或缺少信息时暂停。真实一问一追问须先授权，普通检查不提问。最后分别报告安装、连通、账号就绪和问答验证，以及版本、地址、未验收项和恢复方法。

已经明确选择用途时复述即可，不重复盘问。在线体验不安装软件；共享服务暂未开放，未取得接入批准和第二台设备验收前停止该路线。本节以下命令只用于完整独立部署。缺少 Docker 时先区分未安装与 daemon 未启动，从官方渠道安装且等待系统许可，不接受不明远程安装脚本或绕过企业策略。

## 新安装

Agent 先取得本私有仓库权限与私有 GHCR 镜像拉取权限。认证通过 GitHub/Docker 的安全流程完成，不把访问令牌交给聊天记录。Git、Docker/Compose 和系统授权须先就绪。

公开 Provider 源码不等于网站镜像公开；私有仓库可读也不保证私有 GHCR 包可拉取。
先由维护者确认部署身份对配套镜像的读取授权，再运行初始化；遇到 401/403 停止，
不能改用未知镜像或复制 Air 配置绕过。安装器不会替用户授予注册表权限。

发布后的 Mac/Linux 命令：

```sh
sh onboard.sh doctor
sh onboard.sh init --project my-zhitianxia --web-port 4417 --provider-port 3317
sh onboard.sh check
```

Windows:

```powershell
.\onboard.ps1 doctor
.\onboard.ps1 init --project my-zhitianxia --web-port 4417 --provider-port 3317
.\onboard.ps1 check
```

Shell/PowerShell 包装自动取得固定 Provider tag 的源码，引导器下载用户级 Node 和版本匹配的专用 Chromium。不会改日常浏览器、全局 Node 或已有 Docker 服务；不绕过 Windows 执行策略。Linux server 模式不安装桌面浏览器。

发布模式从公开仓库 `https://github.com/19Chris19/ima-qa-web-agent.git` 的
`deploy/bundle.env` 的 Provider tag 取得工具；本分支默认镜像为
`ghcr.io/19chris19/ima-qa-web-agent:v0.6.2` 与
`ghcr.io/19chris19/explorer-ai-qa-demo:v0.4.2`；不跟随 main/latest。
执行缓存工具前核对 origin、tag 对应提交与干净工作树；不匹配时停止，不能删除
旧安装数据来修复缓存。显式镜像覆盖也必须通过配套版本标签校验，随后记录摘要。
版本标签是配套检查，不是签名或来源认证，候选源码与镜像仍须人工审查。

安装从官方分享元数据解析并核对数字 ID；无需手工找 ID。可显式使用 `--share-url '官方分享链接'` 覆盖预设。错误链接或不能确认权限时停止，不猜测。

正式安装使用固定 tag 和配套镜像，不需要指定本地候选源码。旧 `deploy.sh init --kb` 是高级兼容入口，**不包含新扫码准备**；新安装走 onboard。

`STATUS=released` 启用固定公开 Provider tag 的来源校验，不代表网站 Release
已经发布、已稳定或真实扫码已经验收。两边镜像的版本标签必须分别匹配
`deploy/bundle.env`；最终安装证据以各自 Release 附件为准。

## 扫码、人机交接

工具报告网站与独立管理页地址。管理页仅绑定本机，Agent 在其中使用私有管理员配置登录，不输出 token。点击接入账号会检查助手通路，随后打开官方 IMA 窗口。

提醒人：**请用已加入“3DGS 知识答疑”的 IMA 账号**。官方预设链接：
[3DGS 知识答疑](https://ima.qq.com/wiki/?shareId=e528d98d028732fcd9b6adcc879db1463a8b3e4c8f8beb82a7519c4b4fdf8e64)。

人扫码、手机确认；若未加入或等待批准，在同一官方窗口处理后点“已处理，继续验证”。不自动加入、不以会话创建代替权限。权限未确认时账号不进可用池；取消、失败、超时清临时资料。

管理页的一次资格问答在扫码前明确声明。CLI 接入不自动做问答。真正的一问一追问另在授权窗口执行，记录流式、来源、唯一终态和历史恢复，不保存原文到 Git。

## Linux 服务器

登录受限的分享页由桌面维护机使用 Provider 的 `resolve --mode desktop --target-file` 先解析，再通过已授权 SSH/SCP 传送不含凭证的目标元数据文件。服务器安装可加 `--target-file .maintenance/resolved-target.json`；后续扫码权限仍需验证，文件不代表账号已获授权。

服务器运行双服务 Compose，网页入口仍需按生产方案配置 HTTPS/域名；一键初始化不自动做 DNS、证书或主站接入。维护电脑拉同一 Provider 版本后按其 `docs/AGENT_DEPLOYMENT.md`：

```sh
# 在桌面维护电脑的 Provider 固定源码目录
sh onboard.sh remote-prepare --ssh my-server --remote-env /absolute/path/to/website/.docker-lab/provider.env
sh onboard.sh tunnel --ssh my-server --remote-port 3317 --local-port 13317
# 另一个终端，隧道保持运行
sh onboard.sh enroll --env .onboarding/remote-admin.env --server-url http://127.0.0.1:13317 --name account-a
```

只复制维护所需管理员配置，不复制 Air 账号或会话。SSH 主机密钥由人确认；不关闭校验、不暴露容器管理路由。账号最终存服务器。

## 中断、修复、升级、回退

`sh onboard.sh resume` 继续本工具已初始化的安装，不重新生成凭证。`repair` 只修助手或补未配置的连接，不自动重启既有 Provider。识别到旧安装或别的目录时停止，由 Agent 提出经审查的迁移，不能删配置后重来。私有源码助手目录保持固定，不在运行中移动/升级依赖。

恢复、检查与修复同时核对记录中的网站版本、Provider tag 和独立部署拓扑；缺失或
不匹配会要求经审查的升级，不能编辑安装记录冒充新版本。candidate 转 released
本身不会升级已经固定的镜像，也不构成该安装已完成发布验收的证据。

网站启动后继续使用既有 `sh deploy.sh check|backup|upgrade REVIEWED_WEBSITE_DIGEST|rollback|stop`。Windows 可由 Agent 运行等价 Compose 操作；Shell 备份/升级入口在 Windows 原生尚未验收，不能宣称已经全平台通过。网站代码回退保留当前数据；Provider 和账号卷升级走独立窗口，不顺带重启。

备份 `.docker-lab` 私有配置与两个独立卷；不得公开分享，不执行 `down -v`。公网反代只转网页及 `/api/qa/`，拒绝 `/admin`、`/internal/`。Vercel 只是预览入口，不等于生产托管。

## 验收门槛

服务启动、浏览器通路、等待扫码、授权通过、真实问答通过必须分别报告。空池可以启动并显示暂无可用账号，不能称可问答。合成测试覆盖配置保护、协议匹配、委托扫码、排队/SSE/历史及管理封锁；没有真实新账号、Windows 真机或 Linux SSH 环境时标记 NOT RUN。详见 [候选记录](ONBOARDING_ACCEPTANCE.md)。

