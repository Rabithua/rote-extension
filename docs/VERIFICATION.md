# 首版验收记录

日期：2026-09-07。构建目标：Chrome MV3，最低 Chrome 120。

## 已通过

- ESLint、TypeScript、21 项 Vitest 单元测试、WXT 生产构建。
- 7 项 Playwright 测试，使用真实 Chromium 加载生产扩展，X DOM 和 Rote API 为模拟环境。
- 提取正文、换行和 emoji；排除相邻帖、引用图片、视频；拒绝折叠正文；内容 ID 与来源匹配校验。
- 正确目标保存、连续菜单挂载、键盘导航、中英文、深浅主题、与原生模拟菜单相同行高/字体/内边距。
- 四个路径形态（首页、详情、搜索、个人主页）、360px 设置页、125% 页面缩放、可见四角点击、节点复用时拒绝串帖。
- 两张图片按序保存、重复提交去重、上传失败沿用同一笔记恢复。
- 创建成功但响应损坏：待核对，通过搜索关联唯一原笔记，不重复创建。
- 上传中停止真实 Service Worker 后唤醒，IndexedDB 保留的任务和图片可恢复，同一笔记最终得到两张图片。

## 线上 Rote

未修改 Rote 服务端或 CORS。在独立 Chromium 测试配置中，给后台授予目标主机权限后成功连接 `https://api.rote.ink`。真实 OpenKey 权限核验通过。

- 私密纯文字测试笔记：`add33b26-83bc-45cf-9071-553fa975cfb4`，GET 确认 state=private。
- 私密双图测试笔记：`fed7ca6e-215f-4d02-9e04-5f6f0e43219b`，真实 presign / PUT / finalize / GET，确认 2 张附件与顺序、state=private。
- 以上是带 `[Rote Extension 联调测试]` 标记的合成数据；图片使用合成 PNG，不能当作真实 X CDN 全链路验收。测试笔记保留供用户检查。
- 为覆盖不同部署的对象存储，独立一次性线上测试构建预授予 HTTPS 上传主机访问；正式交付包仍按实际域名单独申请。

## 真实 X 与视觉边界

已在用户登录的 Dia（Chromium）中安装扩展，读取真实 X 首页和帖子详情，验证分享菜单中出现「保存到 Rote」，首次设置引导可打开并成功连接线上 Rote。

真实结构验收发现并修正普通 `a[role=link]` 误判为引用帖，以及菜单项嵌套容器导致的插入位置问题。测试夹具已加入这些结构。

后续刷新真实 X 详情页持续停留在加载中，真实帖子从点击到最终保存的完整联调尚未完成。

真实 X 的全路径、长时间连续滚动、所有主题/缩放组合和逐项视觉对照仍需人工补验；当前桌面截图接口无法获取 Dia 截图，不能声称已完成与 Rote Web / X 的真实并排视觉验收。自动化截图只代表模拟页面。

## 0.1.1 默认标签与可见性（2026-09-07）

新增默认标签输入和私密/公开选择，沿用已有 Rote Input 与 select 比例，中英文文案齐全。标签支持中英文逗号分隔、去重和去除前导 #，遵循服务端 20 个/每个 50 字符限制。

24 项单元测试、8 项 Chromium 测试、lint、类型检查及生产构建通过。新增验收覆盖：旧配置迁移、非法标签和可见性拒绝、公开创建请求、设置持久化、新任务使用新默认值、旧任务及升级前任务保持原有私密性。公开场景仅在本地模拟服务测试，本轮未发布任何线上公开笔记。

## 0.1.2 独立设置标签页

将 options_ui.open_in_tab 设置为 true。生产构建通过；真实 Chromium 验证：点击工具栏弹窗的设置按钮，打开顶层 options.html 标签页，默认标签设置控件可见。设置数据保持不变。

## 0.1.3 工具栏入口与升级兼容

移除 action.default_popup 和 popup 构建入口，注册 action.onClicked 打开独立设置页。默认标签字段加入前端旧协议数据校验与空值兼容，防止旧后台回复缺少 defaultTags 时调用 join 崩溃。关闭 Vite 模块预加载，产物没有 modulepreload 链接；设置页面正常加载所需的 script/CSS。

lint、类型检查、24 项单元测试、10 项 Chromium 测试及生产构建通过。新增浏览器验收模拟旧后台回复，确认默认标签为空、可见性私密且无 pageerror；检查工具栏无 popup、click handler 已注册，并验证其调用的 openOptionsPage 打开独立设置标签页。历史错误条目不会因安装新版本而自动清除。

## 0.1.4 双栏设置布局

宽窗口左侧为设置，右侧为最近采集，页面最大宽度 1160px；800px 以下切回单栏。收紧字段间距、说明文字和任务行间距，保留 Rote 输入框与按钮的尺寸。移除已不使用的弹窗布局分支与样式。

lint、类型检查、24 项单元测试及生产构建通过；10 项 Chromium 测试通过，覆盖 360px 无横向溢出。已查看 1100px 深色中文截图，双栏标题对齐，设置操作完整可见。

## 0.1.5 自动添加平台标签

在默认标签下增加 Rote Switch，默认关闭。开启后根据采集平台添加标签（当前为 X），和默认标签去重。最终标签在入队时记录，关闭开关不改变已存在任务；包含平台标签在内最多 20 个，超限会提示调整，不丢弃用户标签。开关复用 Rote 原始尺寸与状态样式。

lint、类型检查、26 项单元测试、11 项 Chromium 测试及构建通过。覆盖开关持久化、开/关后的实际创建请求、去重、任务设置快照、标签总数限制、标签点击、键盘 Space 与开关可见角落点击。补齐 Rote 的 dark variant 后重新验证深色主题与平台开关两项测试，并查看深色截图。

## 0.1.6 保存后关闭分享菜单

通过当前菜单所在浮层的 mask 点击调用宿主关闭行为；没有 mask 时向原生菜单项发送带 keyCode/which 的 Escape。取消在 Escape 捕获阶段直接移除 Rote 行，由宿主菜单移除后清理。

26 项单元测试、12 项 Playwright Chromium 测试、lint、类型检查和生产构建通过。模拟菜单改为由遮罩点击或 numeric Escape 关闭，不再接受 body.click；验证鼠标与键盘保存、正文折叠拒绝、上传等待期间整个菜单关闭、焦点返回和重新打开后的已保存状态。新增无遮罩的键盘关闭回退测试。本轮未在真实登录 X 页面复验，模拟验收不能替代真实站点验收。

## 0.2.0 GitHub capture and independent columns

Public GitHub repository homepages now have a Save to Rote button beside Star. Notes contain only repository name, description when present, and URL. Capture types, task IDs, status queries, notifications, and sender validation distinguish X and GitHub. GitHub uses the existing defaults and optional GitHub platform tag.

Desktop settings use viewport height with independent column scrolling, a fixed brand and sticky activity title. Short windows allow the settings column to scroll to its submit button. At 800px and below the document uses a single scrolling column.

Validation: lint, typecheck, production build, 31 unit tests and all 16 Chromium scenarios passed across the full regression and targeted reruns. GitHub coverage includes missing descriptions, private/unknown visibility exclusion, navigation and remounting, deduplication, tags, failed-create recovery, keyboard Enter, Chinese dark theme, and visible corner clicks at 125% zoom. Layout coverage includes independent scrolling, 600px height, and 360px width.

Live validation on the signed-out octocat/Hello-World GitHub page: injected and adjacent native buttons measured 28px high; light-theme screenshot inspected. Clicking the extension button created private note 51eb42ba-4984-4854-a64d-e6f9babddf22 on api.rote.ink. GET confirmed exact repository name, description and link. Issues pages had no button; returning home showed Saved to Rote. Live dark-theme inspection used an attribute change; complete dark interaction coverage uses the local fixture. Logged-in GitHub UI variants were not directly tested.

## 0.2.1 Sidebar scrolling and GitHub action discovery

Corrected the reference to Rote's dashboard layout: sticky left column and overflow-visible content, with document scrolling instead of nested scroll containers. Tall sidebars use a measured sticky offset so their bottom remains reachable without an internal scrollbar. Narrow layouts remain single-column.

GitHub action discovery no longer requires both pagehead-actions and btn. It ignores hidden legacy containers, locates visible Star/Fork groups, preserves the native button classes and component attributes, supports list and div containers, and observes delayed public metadata. These are confirmed gaps in the previous implementation; the user's specific missing-button cause is not confirmed because computer-use access to their current GitHub URL was denied. No alternate browser-control path was used for that URL.

Validation: 31 unit tests, lint, typecheck and production build pass. All 18 Chromium scenarios pass across regression and targeted reruns. Added fixtures cover modern Star/Fork markup, hidden duplicate action lists, cloned/rebuilt controls, and delayed public metadata. Sidebar checks assert document scrolling, visible overflow in both columns, stable sticky position, short-window submit access and narrow layout. The dark sidebar screenshot was inspected. The current signed-in GitHub page remains unverified.
