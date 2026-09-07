# 组件与协议来源

基准：[`Rabithua/Rote`](https://github.com/Rabithua/Rote)，commit `b6196a2420cc4f798f3318733e160b315641a09e`，MIT（本仓库 LICENSE 保留原版权）。

- `web/src/components/ui/button.tsx` → `src/ui/button.tsx`：保留尺寸、variant、主次层级，只调整本地 `cn` 导入。
- `web/src/components/ui/switch.tsx` → `src/ui/switch.tsx`：保留原生开关比例、键盘交互及状态样式，使用同源 dark variant。
- `web/src/components/ui/input.tsx` → `src/ui/input.tsx`：保留原组件比例与状态。
- `web/src/styles/index.css` 的主题变量 → `src/ui/styles.css`；扩展布局单独编写，不影响 X 页面。
- `web/public/ico.svg` → `public/rote.svg`，同源图标制作浏览器尺寸 PNG；X 内标识采用单色 currentColor。
- OpenKey 接口按当前服务端与 rote-toolkit 的 notes / permissions / attachments 协议实现，客户端不导入 Node 文件系统模块。

附件上传依次执行 presign → PUT → finalize；持久化 UUID 和笔记 ID。服务端附件数据库 ID 与上传 UUID 不同，通过对象文件名匹配上传身份。依次 finalize 形成稳定创建顺序，并在最终 GET 中核对附件顺序。

框架：[WXT](https://wxt.dev/)，浏览器网络模型：[Chrome Extensions](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests)。具体依赖版本由 `bun.lock` 锁定。

GitHub uses the host's btn / btn-sm and flash classes without global CSS injection. Public visibility and repository identity come from page octolytics metadata; description comes from the About text node. Verified against octocat/Hello-World on 2026-09-07. Independent viewport-height scrolling follows Rote SideContentLayout behavior while retaining the extension's existing column proportions.

0.2.1 correction: use web/src/layout/dashboard/index.tsx as the sidebar reference (sticky sidebar and overflow-visible content). SideContentLayout is the separately scrolling auxiliary panel and is not the requested primary sidebar behavior.
