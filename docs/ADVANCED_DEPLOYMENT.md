# 高级部署：Node 与既有 Provider

新用户优先使用 [Agent 统一引导](AGENT_DEPLOYMENT.md)。以下是已明确掌握 Provider 部署和凭证的维护者路径，不会自动准备完整扫码通路。

## 手工 Node / 接入已有 Provider

在独立网站仓库根目录，需要 Node 20+，推荐 Node 22。先审查既有 Provider 的合同、权限和容量，再配置网站；不要因为本机 3117 存在就自动接入。

本轮 v0.2.1 candidate 的引导基线固定为 Provider v0.4.2；旧版本保有相同问答
合同不代表具备本轮扫码工具。下面的 Node 命令只启动网站，不安装 Provider、
不建立独立账号池，也不替代统一入口。仅在明确授权共享既有 Provider 时使用；
普通新安装仍走 onboard，且不依赖 Air。Node 路径不拉网站容器镜像，但仍需
私有源码权限；切换 Docker 路径时必须另行取得私有 GHCR 包权限。

```sh
npm ci
npm test
npm run build
npm run configure:local -- --provider-env /absolute/private/provider.env
npm start
```

默认网页监听 `127.0.0.1:4317`，默认 Provider 地址 `127.0.0.1:3117`，可通过服务端私有配置调整。配置工具不打印密钥；网站问答只使用普通和服务凭证，管理员凭证不参与业务问答。远程 Provider 需私有网络或 SSH 隧道。完整接口说明见 [网站接入指南](PROVIDER_A_WEB_INTEGRATION.md)。

共享 Provider 会共享账号容量、维护窗口与故障影响。网站不能读取或直接挂载 Provider 账号卷；Cookie 身份和网站队列仍独立。部署者应明确容量和维护责任，不能宣称网页流量不影响机器人。

## 旧版 Docker 路径

v0.2.0 的固定镜像安装和源码构建记录见其 tag 内的 `VERSIONED_RELEASES.md`、`DOCKER_QUICKSTART.md`。当前 `deploy.sh init --kb` 仅为高级数字 ID 兼容入口，不准备扫码工具；候选仍需显式提供镜像。已有目录按其安装记录恢复，不在原目录混跑另一种初始化。

原生 Node/LaunchAgent、源码构建 Docker 和引导 Docker 的维护步骤不同。备份配置和代码指向后再安排迁移；禁止通过删除私有目录、重新生成密钥或覆盖账号卷来“修复”部署。
