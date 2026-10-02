# Air 双服务 Docker 演练

## 边界

本流程从 Provider A v0.4.0、网站 6a84ca7a 建立候选。真实应用使用空账号池；另一个合成项目不访问 IMA。
不迁移现有 Air 账号、Cookie、refresh token、密钥或会话，不操作 3117/4317。
Docker Desktop 是 Linux ARM64 虚拟机，不等于已完成 Linux 物理服务器或云服务器的长期验收。

## 构建与启动

需要 Docker Compose 2.24.4+（合成覆盖文件使用 `!override`）、Node 22 和两个独立仓库。
在 Provider A 干净 v0.4.0 目录先执行原版流程：

```sh
npm ci
npm run setup:provider-a -- --kb 999000111 --allowed-origins= --host-port 3317
docker compose -p air-provider-baseline up -d --build
curl --noproxy '*' http://127.0.0.1:3317/healthz
docker compose -p air-provider-baseline stop
```

999000111 是演练值，不代表真实知识库。原版对 `--allowed-origins ''` 的空参数解析错误已在 Provider 候选修复；原版请用带等号写法。
原版初始化打印的接入提示固定 3117，也已在候选修复。本轮不运行接入账号命令。

在网站候选目录串行执行：

```sh
npm ci
npm test
npm run build
node scripts/prepare-docker-lab.mjs
docker build -t air-explorer:lab .
docker compose -p air-qa-lab -f compose.linux.yaml up -d --no-build --wait --wait-timeout 180
node scripts/verify-docker-lab.mjs
```

配置已存在时初始化拒绝覆盖；保留 `.docker-lab/` 私有目录（0700/0600）。不要运行会输出所有凭证的 `docker compose config` 或未过滤的 `docker inspect`。
入口为 http://127.0.0.1:4417；Provider 维护入口 http://127.0.0.1:3317。
BFF 使用 UID 1000，根文件系统只读，独立命名卷可写。Provider 卷与网站卷不共享。
内部地址来自服务端固定白名单 `http://provider-a:3000`。网站入口仅放行固定静态资源和 `/api/qa/`，不代理管理接口。
`PROVIDER_IMAGE` / `EXPLORER_IMAGE` 可指定已构建镜像；正式交接应固定不可变镜像摘要，而非漂移的 latest。

健康检查只代表进程响应。容量为 0 时 `ready=false` 才是正确结果。已有 `check:integration` 会以非零退出，不应为了空池验收改成可问答。
首次拉取镜像或宿主高负载时健康检查可能超时；先检查只含脱敏启动消息的日志，等进程健康后重试 `up`，不要重启其他服务。

## 合成验收

```sh
docker compose -p air-qa-synthetic -f compose.linux.yaml -f deploy/docker/compose.synthetic.yaml up -d --no-build --wait --wait-timeout 180
node scripts/verify-docker-lab.mjs --synthetic
```

合成入口 http://127.0.0.1:4418。假 Provider 与 BFF 仅加入 internal 网络，无外网出口；只有 Nginx 另接浏览器入口网络。假 Provider 没有上游客户端。
相同 BFF、Nginx 与前端镜像验证字节切块 SSE、表格、历史、两用户隔离、去重、排队编辑删除、取消及断流。
合成页面的“回答已验证”仅代表模拟响应，不代表 IMA 验证。测试脚本保留签名测试会话到忽略目录，便于重建后复验。

## 重建、恢复与回退

```sh
docker compose -p air-qa-lab -f compose.linux.yaml up -d --force-recreate --no-build --wait --wait-timeout 180
node scripts/verify-docker-lab.mjs --restore
docker compose -p air-qa-synthetic -f compose.linux.yaml -f deploy/docker/compose.synthetic.yaml up -d --force-recreate --no-build --wait --wait-timeout 180
node scripts/verify-docker-lab.mjs --synthetic --restore
node scripts/rehearse-docker-recovery.mjs
```

备份演练先停止本测试项目，备份两个卷，再恢复到全新卷并校验，最后切回原卷。私有配置单独保留，不在 Git。
此脚本硬编码测试项目名称，不能用于生产。备份包包含测试数据，也只能保留在 `.docker-lab/`。
异常退出测试使用独立 `air-restart-policy-check` 容器，同一网站镜像、`restart: unless-stopped`；测试程序首次自行以 42 退出，在容器内临时目录留下标记，重启后保持运行。确认 RestartCount=1 后停止该测试容器。不要用 `docker kill` 冒充自动故障恢复（人工停止可能抑制重启），不要杀 Docker Desktop。
代码回退：先确认队列空闲，设 `EXPLORER_IMAGE` 为先前保存的镜像，`up --force-recreate --no-build` 同时重建网站与网关（Nginx 需重新解析容器地址）。保留同一配置和数据卷，不覆盖为旧快照。

结束合成测试：

```sh
docker compose -p air-qa-synthetic -f compose.linux.yaml -f deploy/docker/compose.synthetic.yaml stop
```

空池服务继续运行。停止空池服务使用同一命令的 `air-qa-lab` 与单一 Compose 文件。不要加 `-v`，不要执行全局 prune。

## 服务器验收边界

AMD64 用 `docker build --platform linux/amd64` 单独构建，启动时同样显式指定架构；只评价兼容性，不评价仿真性能。
例如在各自仓库分别执行 `docker build --platform linux/amd64 -t air-provider:amd64 .` 与 `docker build --platform linux/amd64 -t air-explorer:amd64 .`。不要在后台同时构建两个镜像；仿真完成后停止检查容器，避免挤占本机业务资源。
正式 Linux 上线仍需要专用账号人工扫码和知识库授权、HTTPS、域名、监控告警、备份、升级窗口与真实一问一追问。
Air 睡眠、合盖、断网或 Docker Desktop 退出会中断服务。`restart: unless-stopped` 不能让电脑开机或阻止系统休眠。

## 本次结果

2026-10-02 本地结果，未推送或发布：

| 类别 | 结果 |
| --- | --- |
| 原版 Provider | ARM64 原样构建；空 origin 参数失败已复现，等号写法启动成功；内置页与嵌入页 HTTP 200 |
| Provider 修复候选 | 259 项测试通过；修复初始化空参数与错误端口提示；运行时代码及镜像输入与 v0.4.0 相同 |
| 网站候选 | 36 项测试通过、构建通过；仅固定容器地址新增放行；独立命名卷 UID 1000 可写 |
| 真实空池链路 | 已连接、鉴权成功、合同 v1、ready=false、capacity=0；普通/内部/管理员 token 不混用 |
| 合成问答 | Nginx → BFF → fixture：字节分片 SSE、正文与历史一致、表格/来源、双用户隔离、去重、排队编辑删除、取消和断流通过 |
| 重建与备份 | 空池会话归属与合成历史重建后保留；合成项目两个卷备份恢复到新卷通过，再切回原卷成功 |
| 代码回退 | 切换到本轮前一网站候选 `air-explorer:rollback-before-admin`，沿用当前卷与密钥，历史归属检查通过；不是回退到不兼容的旧公开网页 |
| 异常进程 | 独立同镜像测试程序退出 42 后 RestartCount=1，恢复运行；未重启 Docker Desktop |
| AMD64 | 两镜像构建成功、x64 启动与空池检查通过；并非 x86 原生性能验收 |
| 浏览器 | Ego 1366×768 与 390×844：表格可读、页面不横溢、刷新后表格 DOM 一致；禁用的管理入口不显示 |
| 安全 | 两镜像应用文件扫描无测试凭证，Provider 打包无运行数据；网站入口拒绝管理/内部/未知/私有文件路径；BFF 无宿主端口 |

AMD64 首次构建 npm 下载 ECONNRESET，重试成功；仿真启动在并发构建负载下触发 Provider 原有 20 秒存储工作进程超时，构建结束后启动成功。没有扩大存储锁超时或修改 CAS 来掩盖它。正式 x86 服务器仍须独立验证。
截图与测试私有数据仅在忽略目录 `.docker-lab/`；不提交到仓库。
现有 3117/4317 只读复查正常，4317 容量仍为 4。未重新扫码、未使用其账号池或发送真实问题。
尚未验收：真实扫码、真实 IMA 首问/追问、登录续期、真实 Linux 长期运行、公网 HTTPS。
