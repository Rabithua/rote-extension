# Chrome Web Store release

- Existing item: https://chromewebstore.google.com/detail/cahpbdbfdfnmoachkjmcfgbbnmjcbpej
- Source: https://github.com/Rabithua/rote-extension
- Support: https://github.com/Rabithua/rote-extension/issues
- Privacy: https://github.com/Rabithua/rote-extension/blob/main/docs/PRIVACY.md
- Submitted version: 0.4.8 (published version remains 0.4.4 until approval)
- Verified submission status on September 9, 2026: Pending review; publish automatically after approval. The dashboard confirmed submission and displayed `状态：待审核` / `该草稿尚待审核。`.

Build with `bun run check`, then run `bun run test:e2e`. Create the store ZIP from the **contents** of `.output/chrome-mv3`, with `manifest.json` at its root. Do not upload the developer bundle containing a `chrome-mv3` parent folder, docs or source. Review credentials belong only in the dashboard's private testing instructions and must never enter the source or package.

English and Simplified Chinese listing descriptions explain webpage bookmarks, exact text selections, supported-page captures, images, default tags/visibility/archive settings and recovery. Avoid enumerating platform names: the initial platform list triggered the Yellow Argon keyword-stuffing check. Each existing locale now has five localized feature illustrations from `assets/store/0.4.8/`; the three existing global fallback screenshots are unchanged. The outdated upgrade paragraph was removed from both descriptions. No new languages, promotional tiles, permissions or other store fields were added in this localization update.

The review key was verified for private text creation, attachment upload/finalize and note retrieval. It must remain available throughout review. Saved data is disclosed as website content, authentication information, browsing-history data limited to chosen URLs, and identifying author metadata. No remote code, ads or analytics are used.

## 0.4.8 submission validation

- `bun run check`: lint, type checking, 62 unit tests and production build passed.
- `bun run test:e2e`: all 43 Chromium scenarios passed.
- English and Simplified Chinese short summaries match the package and stay within 132 characters.
- The uploaded ZIP contains 21 production files with `manifest.json` at the root and only `en` / `zh_CN` locales. No source maps, environment files or OpenKey credentials were included.
- Store ZIP SHA-256: `5fd049b25b22ce3fece7b526f71dd6e87aef672a748784539bd706aeef2012ad`.
- Existing private testing credentials and data-use declarations were retained. This copy-only release did not repeat live note creation; capture and attachment recovery were covered by the Chromium regression suite.
