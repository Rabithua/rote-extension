# Rote Extension

在 X 原生分享菜单末尾添加「保存到 Rote」。使用 WXT、TypeScript、React、Manifest V3 和 Bun。首版供个人开发者模式试用。

## 安装

1. 解压发布 ZIP，保留整个 `chrome-mv3` 文件夹。
2. 打开 `chrome://extensions`，开启「开发者模式」，点击「加载已解压的扩展程序」，选择包含 `manifest.json` 的 `chrome-mv3` 文件夹。
3. 打开扩展设置（独立浏览器标签页），填写 `https://rote.ink` 和 OpenKey。官方地址会自动转换为 `https://api.rote.ink`；自部署实例请填写 API 根地址。
4. OpenKey 需要 `SENDROTE`、`UPLOADATTACHMENT`、`GETROTE`。点击连接并批准该 API 域名访问权限。
5. 刷新已经打开的 X 页面，打开某条帖子的分享菜单，点击「保存到 Rote」。
6. 首次上传时，如果对象存储使用另一个域名，文字先保存；在「最近采集」点击授权并重试，只授予任务实际使用的上传域名。

更新时替换原文件夹内容，然后在扩展管理页点击重新加载，并刷新 X 页面。不要删除扩展再安装，否则浏览器会清除本地配置和待恢复任务。

## 保存内容

- 当前帖子完整可见文字、作者名称与账号、发布时间、原帖链接。
- 全部静态图片按原顺序上传为附件；每张支持 JPEG、PNG、WebP，最大 20 MiB。
- 引用帖只保留链接；不采集评论、线程、视频、GIF 视频、外链文章正文或截图。
- 正文有「显示更多 / Show more」时拒绝保存，提示先展开。不自动翻译。
- 创建普通笔记，使用设置中的默认标签与可见性；首次安装及旧版本升级默认仍为私密、无标签。

同一服务地址、OpenKey 和帖子 ID 对应一个本地任务。再次点击已保存帖子不会创建重复笔记。更换 OpenKey 会切换任务空间。

## 默认标签与可见性

在扩展设置中填写「默认标签」，使用中英文逗号分隔，例如 `X, 阅读`；自动去除重复项和开头的 `#`。留空则不加标签。最多 20 个标签，每个最多 50 个字符，与 Rote 接口限制一致。

「默认可见性」可选私密或公开。保存设置后，仅新采集任务使用新值；已保存笔记和待恢复任务沿用采集时的值。升级前的旧任务继续使用私密、无标签。公开模式下，新笔记将在 Rote 中公开可见。

## 失败恢复

- 文字已保存、图片失败：任务保留笔记 ID、上传清单和已下载 Blob，重试仅补传同一条笔记。
- 创建响应丢失：标记「待核对」，不会自动再次创建；点击核对后搜索来源链接，只有正文完全一致且唯一命中时关联原笔记。
- Worker 停止或页面关闭：任务存在 IndexedDB；重新唤醒 Worker 后恢复。创建中的请求会转为待核对。
- 已成功的任务会释放图片 Blob。任务记录用于去重，浏览器清除扩展数据后不再保留本地去重历史。

## 开发

```sh
bun install --frozen-lockfile
bun run dev
bun run check
bun x playwright install chromium
bun run test:e2e
bun run zip
```

生产加载目录：`.output/chrome-mv3`。自动化使用真实 Chromium 加载生产构建，X DOM 和 Rote API 在本地模拟；不会自动访问真实账户或创建线上笔记。

## 架构和权限

`src/sites` 是站点适配层，负责目标绑定、提取、菜单、提示及生命周期。内容脚本只提交 `CaptureItem`。`src/messaging` 校验消息与来源，`src/tasks` 在后台持久化和执行任务，`src/rote` 提供浏览器 fetch 客户端。

OpenKey 只在扩展可信上下文存取，storage.local 设置 `TRUSTED_CONTEXTS`。不会注入 X 页面，也不使用 Rote Cookie。GET OpenKey 参数遵循现有服务端协议，POST 放在 JSON 请求体。发布包不含任何账户配置或测试密钥。

默认主机权限只有 X 与 `pbs.twimg.com`。可选 HTTPS 匹配范围用于运行时申请用户配置的具体服务/上传域名，不会在安装时获得所有站点权限。localhost HTTP 仅用于本地开发实例。

网络请求均从扩展后台发出。有对应 host permissions 时通常无需修改 Rote 或对象存储 CORS。参见 [Chrome 跨域请求文档](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests)。

扩展页面复用 Rote Web 设计变量、Button/Input 和标识。注入 X 的菜单不加载 Tailwind 或全局 CSS，只读取相邻菜单项的计算样式；提示使用独立 Shadow DOM。详见 [组件来源](docs/SOURCES.md) 和 [验收记录](docs/VERIFICATION.md)。
