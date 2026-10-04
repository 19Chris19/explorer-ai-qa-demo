# 同域主站接入候选

此适配属于 v0.2.0 候选，不是主站已经上线的证明。Provider A、网站 BFF 与
主站继续是不同服务；浏览器只访问主站同源的 `/qa-app/api/qa/`。

## 路由与顶栏

主站新增 `/ai-qa` 路由，将 `src/vue/ExplorerQaModule.vue` 放在现有内容区域。
主站自己的页头、侧栏保持不变；该路由顶栏显示 AI 问答、交流群和一个更多入口。
模块使用 `?embed=1` 隐藏内部导航，不嵌套第二套外壳。

合成主站验收：先执行 `npm run build`，再运行
`node scripts/preview-synthetic-host.mjs /qa-app`（根路径参数为 `/`）。
打印的本机地址仅连接脚本内存中的假 Provider，无真实凭证或 IMA 访问；
退出时停止所启动进程并删除其合成运行目录，不操作现有服务。

`requestFocus` 在 Escape 关闭模块内浮层时传出 `more`，主站应将焦点返回
自己的更多按钮。菜单位于被隐藏的内部页头之外，`openOptions()` 在嵌入模式
仍可使用。路由内容区需要明确的可用高度；iframe 不强制 520px 最小高度，
不得为了接入模块再加第二套导航或嵌套页面滚动。

```vue
<ExplorerQaModule ref="qa" module-path="/qa-app/"
  :locale="locale" :dark="dark" :color="color"
  @ready="qaReady = true" @preferences="syncQaPreferences" />
```

主站更多菜单分别调用 `qa.newConversation()`、`qa.openHistory()`、
`qa.openOptions()`。未就绪时禁用这些操作。`ready` 只表示模块界面已加载，
不代表 Provider 有账号容量或真实问答成功。父页面与 iframe 校验相同 origin、
确切窗口和协议 version 1；不向父页面传递问题、回答、会话或凭证。

`locale` 接受 zh/en，`dark` 为布尔值，`color` 接受 blue/teal/graphite。
所有请求和静态资源共用模块前缀；支持根入口和多段子路径。`module-path`
只能是站内路径，不接受第三方 URL、查询串、路径穿越或编码分隔符。

## BFF 和代理

复制对应 `config/environments/*.env.example` 到私有运行位置，生成独立签名
密钥和凭证，配置同一个容器网络中的上游。Node 模式应将容器服务名换成
实际内部地址。Test 域名尚未提供，不以编造域名代替。

使用 `docs/nginx-qa-snippet.conf`；BFF 同时兼容代理剥离前缀和直接带前缀。
部署前用 `nginx -t` 检查真实配置。HTTPS 设置 `DEMO_COOKIE_SECURE=1`，
Cookie 仅限本域和 `/qa-app/`，不设置 Domain。Test 与 production 使用不同
Cookie 名、签名密钥、运行目录和账号目录；不要复制 demo 的状态或凭证。
浏览器的对话与界面偏好也按前缀和 Cookie 名隔离。

CSS 隔离由 iframe 边界提供，主站样式不会修改问答内容。此版本不自动修改
主站登录、作品业务、DNS、证书或 Provider 内部/管理路径。

## 验收门槛

合成测试覆盖配置校验、根/子路径、父子消息来源、主题与语言，以及管理封锁。
仍需在模拟主站和真实团队源码中验证路由、顶栏与高度，再进行实际 Test/正式
环境接入 PR。未取得主站源码时，不能承诺复制此组件即可无需修改地上线。
