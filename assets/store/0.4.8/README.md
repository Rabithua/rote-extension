# Rote Web Clipper — Chrome 商店素材 0.4.8

本套素材已制作完成，尚未上传商店、替换现有素材或提交审核。适用于包含默认归档和胶囊保存提示的 0.4.8。

打开 [整套预览](preview.html) 可对照中英文并点击查看原尺寸；[静态总览](preview.png) 便于快速审阅。

## 交付内容

| 文件夹 | 内容 |
| --- | --- |
| `zh-CN/` | 五张中文功能图，1280 × 800 |
| `en/` | 五张英文功能图，1280 × 800 |
| `promo/` | 共用小图 440 × 280、横幅 1400 × 560 |
| `copy/` | 可直接粘贴的中英文概述、短简介 |
| `render/` | 可编辑 HTML/CSS/SVG 排版、导出与校验脚本 |
| `sources/` | 图片、标识、隔离演示组件的截图 |
| `review/` | 640 × 400 缩小检查图，不用于上传 |

五张图依次展示发现与保存结果、站内入口、选区摘录、图文附件、默认标签/可见性/归档及最近采集。

## 视觉与示意边界

采用经确认的白底、粗黑标题、绿色重点词、交叠窗口，收小标题与辅助文案的字号差距。每张至多一条引导箭头，无角色、星星或散落装饰。

用户于 2026-09-09 明确允许使用示意界面。最终素材混用：

- 可编辑的功能示意：浏览器窗口、项目操作区、帖子菜单、右键菜单、选区页面和精简偏好设置。按实际功能与入口文案重排，**不是完整网页截图**。计数等细节仅作演示，不代表实时项目数据。
- 实际组件截图：Rote 笔记、图片附件、扩展最近任务与胶囊提示。使用本地隔离的演示数据渲染，未创建生产笔记，未使用真实账号或凭证。所有 `@demo` 均为虚构展示身份。
- 图片示例为 imagegen 生成的森林照片，用于说明静态图片附件，未声称从 Rote 官网或某个真实社交帖子采集。

品牌重点色确定为 **`#3ECF4A`**，来自扩展 `public/rote.svg` 与 Rote Web `styles/tailwindTheme.css`。标题和箭头均以可编辑 CSS/SVG 精确赋色；原始 Rote 标识渐变保持不变。生成的概念图没有作为整张成品直接上传。

## 来源与版本

- 扩展：`Rabithua/rote-extension`，`d8625bc`，package/manifest 0.4.8。
- Rote Web：`Rabithua/Rote`，`1c0b1f0ef81292290fe06ddfcb255ee0bf26044f`；`RoteItem`、其 Tooltip 与 i18n，以及对应构建 CSS。
- 扩展组件：`ConnectionForm`、`TaskList`、`CaptureToast`、对应 CSS 和中英文文案；源代码未因本次素材制作而变更。
- `sources/rote.svg`：原有扩展 Logo。Rote 与扩展组件遵循其原仓库 MIT 许可，见下方许可说明。
- `sources/note-*.png`：`noteContent` 格式化的公开示例仓库 `octocat/Hello-World`；项目名、简短简介、规范链接。
- `selection-*.png`、`image-*.png`、`tasks-*.png`：本次原创演示文案/记录。
- `preferences-*.png`：实际连接设置中的默认项裁切，供精简示意核对；连接地址与 OpenKey 输入区不进入成品。
- `toast-*.png`：真实 0.4.8 胶囊提示的保存成功状态；静态截图不表示动画播放。
- `demo-woodland.png`：built-in imagegen 生成，无第三方账号信息、人物或商标；生成意图为自然光森林小路的静态附件示例。未使用外部图库授权素材。

App Store 的既有 Rote 宣传图仅用于视觉参考，没有直接复制第三方宣传画。概述避免平台名称清单、重复升级说明，也不将 AI、全文采集、视频下载等未实现能力写作扩展功能。

## 编辑与导出

`render/artwork.html` 的 `copy` 数组、CSS 和 SVG 可直接编辑。用 `?slide=1..5&lang=zh|en` 选择画面。`render/promo.html?size=small|marquee` 编辑宣传图。所有图片与标识均使用相对路径，可离线预览。

在扩展仓库中安装依赖后执行：

```sh
node assets/store/0.4.8/render/render.mjs
node assets/store/0.4.8/render/validate.mjs
```

导出依赖现有 `@playwright/test` Chromium；字体使用 macOS 的 Arial / PingFang SC，没有把系统字体文件分发到仓库。跨系统重新渲染时需校对字体替换；提供的 PNG 已在 macOS 上固定导出。

可选重新采集原始组件：设 `ROTE_WEB_ROOT` 为已安装依赖的 Rote `web` 目录，运行 `render/serve-ui.mjs`，访问本地 `/ui.html?lang=zh|en&kind=note|selection|image|settings|toast`。`ui.tsx.source` 保留演示源码，服务启动时写入系统临时目录，不参与扩展编译。最终排版导出不依赖此服务或 Rote 仓库。

## 验收

- 12 张导出图的尺寸、图片加载、主副标题边界及重点色均已通过脚本检查；另逐张读取导出 PNG 像素，确认存在精确的 RGB(62, 207, 74)，结果见 `validation.json`。
- 人工检查双语 640 × 400 版本，保存入口、默认归档、主要文案可辨认；窗口外围允许设计性出血，关键操作完整显示。
- 没有 OpenKey、真实私人笔记、登录资料、测试错误或未实现功能；没有平台 Logo 清单或合作暗示。
- `bun run lint`、`bun run typecheck` 和生产构建通过。可选组件截图服务已重新启动并验证图片加载。此变更只包含素材与制作脚本，不修改扩展代码、版本或名称。
- 尺寸依据 [Chrome 官方图片要求](https://developer.chrome.com/docs/webstore/images)：截图 1280 × 800，小图 440 × 280，横幅 1400 × 560。

更新商店时应与 0.4.8 功能配套；本轮未执行上传、发布或审核提交。
