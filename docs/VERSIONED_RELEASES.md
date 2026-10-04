# 一个版本，两种部署方式

## 当前候选推荐入口

v0.2.1 的新安装统一使用 [Agent 引导](AGENT_DEPLOYMENT.md)，默认部署独立 Provider，不要求使用者手工拼接两仓或找数字 ID。配套版本以 `deploy/bundle.env` 为准，安装固定实际摘要，正式流水线记录两边的镜像与源码，详见 [部署模型与发布门槛](DEPLOYMENT_MODEL.md)。候选尚未发布；下文 v0.2.0 命令只作为已发布旧版的维护参考。

## v0.2.0 已发布基线

v0.2.0 保留已验收的品牌问答 UI 与 BFF，加入主站桌面外壳和同域接入适配，
兼容 Provider A v0.4.1 以及声明
`knowledge_agent_keyed_sse_v1` 的后续兼容版本。普通、内部服务和管理员凭证
分离，浏览器只访问网站 BFF。语音仅为不录音的动画预览。

## Docker：不需要宿主机 Node

下载本仓库 Release 源码，安装 Docker 和 Compose 2.24.4+。先以有此私有包
权限的 GitHub 身份登录 GHCR；使用交互或密码管理器，不把 token 放在命令参数。
本仓库权限不自动保证私有容器包权限，维护者需要核对包继承与部署账号授权。

```sh
sh deploy.sh init --kb YOUR_NUMERIC_KB_ID
sh deploy.sh up
sh deploy.sh check
```

`init` 在容器中生成独立配置和空账号池，固定拉到的镜像摘要；默认网站 4417、
Provider 管理页 3317 都只监听本机。无需克隆 Provider 源码或在宿主机安装 Node。
已有 `.docker-lab` 配置必须使用原来的维护流程，不能重复初始化。
空池容量 0 是正确结果，不代表真实问答已验收。账号仍须人工扫码并授权知识库。

```sh
sh deploy.sh backup
sh deploy.sh stop
sh deploy.sh up
sh deploy.sh upgrade ghcr.io/19chris19/explorer-ai-qa-demo@sha256:REVIEWED_DIGEST
sh deploy.sh rollback
```

`up` 不重建已有容器。网站升级／回退只重建网站和网关，检查两个队列并保留
当前数据卷；不重启 Provider。备份包含私有网站配置和运行数据，放在
`.docker-lab/backups/`，不进 Git。Provider 账号备份与升级使用其独立流程。
此包装器不用于 Air 原生 LaunchAgent，也不混用旧 `docker:resume` 的源码部署记录。

## Node 与发布记录

同一 tag 的源码保留 `npm ci`、`npm run configure:local`、`npm test`、
`npm run build` 和 `npm start`。生产推荐 Node 22。私有配置和持久目录由部署者
独立设置，不复制 Air 的账号或 Cookie。

镜像 `ghcr.io/19chris19/explorer-ai-qa-demo:v0.2.0` 同时含 AMD64/ARM64；
Release 附件记录版本、源码 SHA、多平台摘要和合成验收范围。固定摘要优于
浮动 tag。首次发布核验私有包可见性、授权拉取和跨架构启动后才发布 Release。
流水线不使用真实账号，不发 IMA 问题，不代表 Linux 云主机已通过长期运行验收。

## 后续版本与同步

v0.1.0 是部署收口版本；v0.2.0 是已获 4318 用户验收的主站外壳和同域适配
版本，两版可以分别回退。主站素材及窄屏差异见 `MAIN_SITE_ASSETS.md`，
接入和环境配置见 `MAIN_SITE_ADAPTER.md`；真实主站 Test/production 接入仍
需团队源码与独立验收，不以演示验收代替。

私有 PR/CI 合入 main 后，同一固定提交更新 Air 4317 和 Docker 4417。
Air 未登录私有 GHCR 时，可由该发布提交本机构建 Docker 镜像并记录本地
image ID 与 revision；不能声称它具有未拉取的注册表摘要。不得为省略登录
而将私有镜像公开。Vercel 页面来自 Air 4317，本版新增素材的转发白名单也
必须通过预览部署并更新转发层。Provider 通用内置页由其独立 v0.5.0 候选
承担，不搬入品牌外壳或题库。

## v0.2.1 候选补充

统一引导扫码使用 Provider A v0.4.2 候选；两版尚未发布。新安装入口与状态区分见 [Agent 部署说明](AGENT_DEPLOYMENT.md)，旧版部署记录不是新版本验收证据。
