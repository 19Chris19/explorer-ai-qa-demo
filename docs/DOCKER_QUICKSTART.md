# 高级 Docker 源码构建记录

**这不是当前候选的新安装入口。**首次部署统一走 [Agent 引导](AGENT_DEPLOYMENT.md)，工具准备配套 Provider 与扫码通路。以下记录保留给旧源码安装的维护者，日期、提交和命令不代表新候选的推荐基线，不得与现有引导目录混用。

## 旧版源码构建流程

正式版本镜像路径见 [版本部署入口](./VERSIONED_RELEASES.md)：使用
`sh deploy.sh init --kb YOUR_NUMERIC_KB_ID` 与 `sh deploy.sh up`，不需要宿主机
Node 或 Provider 源码。以下保留从固定源码构建的高级路径，不能与版本入口的
同一安装目录混用。镜像公开／私有可见性以 Release 的验收记录为准。

需要 Docker（Linux 容器）、Compose 2.24.4+、Node 22 和两个独立仓库。
Provider A 使用已审查的公开版本或补丁；网站固定使用本仓库的已验收提交。
不从 Air 复制账号库、Cookie、refresh token、加密密钥或会话数据。

2026-10-04 已审查的 Provider A 主线提交为
`ce08c55f6d9b1d801ca0040398471bd2e40af632`（公开 PR #9）。它包含 Docker
初始化与可选扫码助手补丁，保持 v0.4.0 问答合同；旧 v0.4.0 tag 不包含这组
新补丁，本次没有发布新 Release。首次部署可在 Provider clone 中先 checkout
该固定提交，再执行下面的网站启动命令，不跟随漂移的标签升级已有服务。

```sh
git clone https://github.com/19Chris19/ima-qa-web-agent.git
git clone https://github.com/19Chris19/explorer-ai-qa-demo.git
cd explorer-ai-qa-demo
npm run docker:start -- --provider-dir ../ima-qa-web-agent --kb YOUR_NUMERIC_KB_ID
```

网站仓库是私有的，需要 GitHub 访问权限。`YOUR_NUMERIC_KB_ID` 是 Provider A
文档所指的共享知识库 Web 数字 ID，不是 shareId。先确认维护机能访问该共享库。
可加 `--plan` 只检查源码和计划，不生成配置或启动容器。

命令拒绝脏源码、已有配置或同名容器项目。它生成全新的三类 Provider 凭证和
网站 Cookie 密钥，均只写入 `.docker-lab/`；串行构建、记录两个镜像摘要、启动
三个容器，再校验网站版本与鉴权合同。只显示凭证是否配置，不显示值。
新安装默认空账号池，因此“已连接但暂无账号容量”是正常状态，不是问答成功。

默认入口：

- 网站：`http://127.0.0.1:4417/`
- Provider 账号管理：`http://127.0.0.1:3317/admin.html`
- Nginx → 网站 BFF → 私有容器网络 Provider A；账号与网站数据使用不同持久卷。

两端仅绑定主机回环。正式域名/HTTPS 由服务器反向代理单独配置；不把管理接口
或 `/internal/` 放到公网。可通过 `--web-port`、`--provider-port`、`--project`
选择不冲突的端口和独立项目名，不要让两个项目挂同一运行目录。

## 添加账号：区分 Air 与无桌面 Linux

管理员凭证在私有 `.docker-lab/provider.env`；使用安全的本机读取方式或密码管理器
传给维护者，不放到聊天、Git、命令参数或运行日志。它只用于 Provider 管理页，
不能当网站普通 API 或内部服务凭证。

Air 的现有 3317 使用单独维护浏览器 helper：在管理页点击“接入账号”，打开
官方 IMA 页面扫码，验证后加密保存到 Provider 卷。此 helper **不是默认镜像自带**。
需要包含该补丁的 Provider 版本和私有配置；不要仅因按钮可点击便称添加成功。
配置方式见 Provider 仓库的 `docs/DOCKER_BROWSER_ENROLLMENT.md`（相应补丁发布后）。

Linux 云服务器没有桌面，不会自己弹出 Mac 浏览器。使用官方远程 CLI 接入：

```sh
ssh -N -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 \
  -o ServerAliveCountMax=3 -L 127.0.0.1:13317:127.0.0.1:3317 SERVER_SSH_ALIAS
```

保持隧道，在维护电脑的 Provider 仓库安装依赖并运行：

```sh
npm ci
# 从安全交互输入/私有配置设置 IMA_QA_ADMIN_TOKEN，不将值写在参数里。
npm run admin:enroll -- --name account-a --server-url http://127.0.0.1:13317
```

维护电脑弹出官方 IMA 页面。人工扫码、加入目标共享库并通过服务端验证后，账号
保存到**服务器 Provider 卷**，不是复制 Air 的账号。关闭维护浏览器后服务继续运行。
维护机与服务器应使用兼容的 Provider 版本。不要关闭 SSH 主机密钥校验。

## 停止、恢复与升级

首次安装记录镜像摘要、端口和项目名到 `.docker-lab/deployment.json`，没有凭证值。
停止时用该记录的项目名（默认 `zhitianxia-qa`）：

```sh
docker compose -p zhitianxia-qa -f compose.linux.yaml stop
npm run docker:resume
```

恢复命令使用记录的镜像摘要，不构建、不拉取漂移标签、不重建已有容器、不重置配置。
不要运行 `down -v`，也不要再次执行初始化来“升级”。保留私有配置和两份卷的备份。

升级网站须先审查和测试候选，再检查上游 active/queued 及网站 queued/paused/running
均为 0。备份代码指向、配置与网站卷；只替换网站镜像，重建网站后再重建 Nginx
以重新解析容器地址。使用 Compose 的 `--no-deps` 明确限制影响范围，不重启 Provider。
回退也只切网站代码，使用当前持久卷，绝不用旧备份覆盖更新后的会话或账号。
操作依据：[Compose up](https://docs.docker.com/reference/cli/docker/compose/up/)。

## 上线门槛

先用隔离合成项目验收，再显式做真实一问一追问。核对正文、表格、来源、唯一完成态、
同会话追问与刷新历史。健康 HTTP 200 不能代替这些检查。
Docker Desktop 的 Linux 容器演练不等于真实 Linux 服务器的长期运行验收。
正式上线还需要 HTTPS、监控、备份、人工账号授权和故障演练；语音仍仅为动画预览。
