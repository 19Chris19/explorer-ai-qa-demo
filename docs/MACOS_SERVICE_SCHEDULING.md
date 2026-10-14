# macOS 请求服务调度候选修复

`Background` 会施加 CPU/I/O 调度限制，不适合持续承接用户问答的 Provider、BFF、relay、gateway 和 tunnel。本候选将这五类服务设为 `Interactive`，监控仍为 `Background`；保留现有 KeepAlive、端口、凭证、日志和防休眠设置。

`deploy/macos/launchd-profile.mjs` 从既有私有 XML/binary plist 生成候选副本，校验 plist，保持文件 0600、目录 0700。它不会安装、bootstrap、重启或修改系统安全设置：

```sh
node deploy/macos/launchd-profile.mjs --source /ABS/PRIVATE/prepared/launchagents --output /ABS/PRIVATE/new-candidate/launchagents
```

输出目录必须新建且位于 Git/共享/云同步之外。已有迁移配置可能携带本机路径或凭证，候选 plist 与完整补丁不得提交到 Git。

上线需另行确认：先用旧维护工具关闭入口并证明排空，备份最新数据、兼容补丁、管理脚本和安装 plist，再更新 Provider 与 BFF。将配套 `deploy/macos/control.mjs` 放入维护工具位置，保留单实例运行；切换候选 plist 后检查实际 launchd 状态：

```sh
node deploy/macos/launchd-profile.mjs --verify
```

校验读取实际 `spawn type`，不能只看磁盘模板。新 BFF 的 `checkMaintenance` 为异步实时 IPC，控制工具必须配套更新；CLI JSON/退出码保持兼容。验证 CLOSED、容量、版本与制品摘要后才开放入口。不自动修改 Vercel 生产分支或 Air 机器人。

`Interactive` 是面向用户请求的正常应用调度，不是实时 CPU 预留。满载重建、网络和 IMA 响应仍需分别实测；本轮不施加新的 3DGS 压测。配套版本清单应记录两仓提交、制品摘要、调度模板摘要和回滚路径。回滚保持最新数据、JSONL v2 和统计，恢复成对代码/工具；不能拿旧备份覆盖已经产生的新历史。
