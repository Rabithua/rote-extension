# Rote Web Clipper Privacy Policy / 隐私政策

Effective date / 生效日期: September 7, 2026

## English

Rote Web Clipper is developed by Rabithua. Its single purpose is to save content you choose on the web to your configured Rote service.

### Data handled

When you click Save to Rote or use a capture context menu, the extension processes the selected page title, text, source URL and supported images. Site-specific captures may also read author and publication metadata to identify content and display recent tasks locally. It does not build a browsing-history database or collect browsing activity for analytics. Supported-site scripts observe page changes locally to display capture controls; content is uploaded only when you request a capture.

Your Rote API address, OpenKey authentication credential, preferences and task records are stored in this browser's extension storage. Pending image files and progress are stored locally in IndexedDB so an interrupted upload can resume. Successfully uploaded image blobs are released; recent task records remain for duplicate prevention and recovery. Temporary page-feedback routing is stored in browser session storage. No Chrome Sync storage is used.

### Where data is sent

Chosen content and your OpenKey are sent to the Rote API you configure to create and verify notes and request attachment uploads. The OpenKey is accessible only to trusted extension contexts, is not injected into webpages and is not sent to source sites or image storage. Images are downloaded from supported source CDNs and uploaded using signed URLs to the storage domain returned by your Rote service, after browser permission is granted. Some supported sites use public APIs to retrieve the selected content. These services receive the network requests needed for these operations, including ordinary connection metadata such as IP addresses.

The extension has no advertising or analytics service, does not sell data and does not transfer it for unrelated purposes. Your configured Rote service and its storage providers process saved data under their own policies. By default, new notes are private; you can explicitly choose public visibility. Do not capture sensitive content to a service you do not trust.

### Control and retention

You choose what to save, the destination, default tags and visibility. Tasks already queued retain the settings at capture time. Closing a page does not cancel a queued save. Browser extension permissions can be revoked in extension settings. Removing the extension clears its local data; notes already sent to Rote remain until you delete them in Rote. Changing a key does not delete previous local task records or remote notes. No automatic expiry is applied to remote notes by this extension.

### Contact and changes

Contact the developer through [GitHub Issues](https://github.com/Rabithua/rote-extension/issues). Do not include OpenKeys or private notes in public issues. Material changes to this policy will be reflected here with an updated effective date.

## 简体中文

Rote 网页收藏助手由 Rabithua 开发，单一用途是将用户主动选择的网页内容保存到用户配置的 Rote 服务。

点击「保存到 Rote」或右键采集时，扩展处理页面标题、所选文字、来源链接及支持的图片。站点采集也可能读取作者和发布时间，用于内容识别及本地最近任务展示。站内脚本仅在本地观察页面变化以显示入口；不建立浏览历史数据库，不收集用于分析的浏览活动，仅在用户发起采集后上传内容。

服务地址、OpenKey、偏好设置和任务记录保存在当前浏览器的扩展存储中。待上传图片及进度保存在本地 IndexedDB，以支持中断恢复。成功上传后释放图片 Blob，任务记录继续保留以防重复和恢复；临时页面提示信息保存在浏览器会话存储中。不使用 Chrome Sync 同步。

选中的内容和 OpenKey 发送到用户配置的 Rote API，用于创建与核对笔记及申请附件上传。OpenKey 仅在扩展可信上下文使用，不注入网页，不发送给来源网站或图片存储服务。图片从支持的 CDN 下载，经授权后通过签名链接上传到 Rote 返回的存储域名。部分站点通过公开 API 读取所选内容。相关服务会接收完成这些操作所必需的网络请求及 IP 地址等普通连接信息。

扩展没有广告或分析服务，不出售数据，不为无关目的转移数据。Rote 服务及其存储提供者按各自政策处理保存的数据。新笔记默认为私密，用户可主动选择公开。请勿向不信任的服务采集敏感内容。

用户决定保存内容、目的地、默认标签和可见性；已入队任务沿用采集时的设置，关闭页面不会取消保存。可在浏览器中撤销扩展权限。卸载扩展会清除本地数据；已保存到 Rote 的笔记需在 Rote 中删除。更换密钥不会删除先前的本地任务或远程笔记，扩展不为远程笔记设置自动到期时间。

联系开发者请使用 [GitHub Issues](https://github.com/Rabithua/rote-extension/issues)，请勿在公开反馈中包含密钥或私人笔记。政策变化会在本页更新生效日期。
