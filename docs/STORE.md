# Chrome Web Store release

- Existing item: https://chromewebstore.google.com/detail/cahpbdbfdfnmoachkjmcfgbbnmjcbpej
- Source: https://github.com/Rabithua/rote-extension
- Support: https://github.com/Rabithua/rote-extension/issues
- Privacy: https://github.com/Rabithua/rote-extension/blob/main/docs/PRIVACY.md
- Submitted version: 0.4.11 (published version is 0.4.10 as verified on October 19, 2026)
- Verified submission status on October 19, 2026: Pending review; publish automatically after approval. The dashboard confirmed submission with `已将您的扩展程序提交送审` and displayed `状态：待审核`.
- Listing homepage: https://github.com/Rabithua/rote-extension. The dashboard rejected `https://rote.ink` as inaccessible even after saving again; the public extension project homepage passed validation. The verified official website remains `rote.ink`.

Build with `bun run check`, then run `bun run test:e2e`. Create the store ZIP from the **contents** of `.output/chrome-mv3`, with `manifest.json` at its root. Do not upload the developer bundle containing a `chrome-mv3` parent folder, docs or source. Review credentials belong only in the dashboard's private testing instructions and must never enter the source or package.

English and Simplified Chinese listing descriptions explain webpage bookmarks, exact text selections, supported-page captures, images, default tags/visibility/archive settings and recovery. Avoid enumerating platform names: the initial platform list triggered the Yellow Argon keyword-stuffing check. Each existing locale now has five localized feature illustrations from `assets/store/0.4.8/`; the three existing global fallback screenshots are unchanged. The outdated upgrade paragraph was removed from both descriptions. No new languages, promotional tiles, permissions or other store fields were added in this localization update.

The review key was verified for private text creation, attachment upload/finalize and note retrieval. It must remain available throughout review. Saved data is disclosed as website content, authentication information, browsing-history data limited to chosen URLs, and identifying author metadata. No remote code, ads or analytics are used.

## 0.4.11 submission validation

- Release review found and fixed a keyboard-order gap when Bilibili's native Share action is a non-focusable div. The original isolation fix is in PR #13; the review fix is in PR #14, merged to main as `e8648f2bb0c779c3e4b284b0ae60a89fb616c221`.
- Lint, type checking, all 123 unit tests, all 60 Chromium scenarios and the production build passed. The new native-div keyboard regression failed against the previous build before passing with the fix.
- The rebuilt `.output/rote-extension-0.4.11-chrome.zip` matches all 20 production files, with `manifest.json` at the root. It excludes the test-only Vue runtime, disposable browser-test hooks and test-only permissions. Bilibili CSS is now shadow-only, so there is no document-level Bilibili stylesheet in the manifest.
- Store ZIP SHA-256: `3a148d6d30ba5cb73774925fc0f44c1f2329c0bf0d52fb5c45a2f27c2d6511a7`.
- On October 19, 2026, the existing item's package page confirmed uploaded draft 0.4.11 and published version 0.4.10. The existing listing content, permissions and data-use declarations were retained.
- Submitted successfully with automatic publication after approval selected. The dashboard confirmed `已将您的扩展程序提交送审` and then `状态：待审核`. This confirms submission, not approval or publication of 0.4.11.

## 0.4.10 submission validation

- `bun run check`: lint, type checking, all 123 unit tests and production build passed.
- `bun run test:e2e`: all 54 Chromium scenarios passed.
- Uploaded `.output/rote-extension-0.4.10-chrome.zip` to the existing item. The dashboard's draft package showed 0.4.10 and its published package showed 0.4.8 before submission.
- The ZIP matches all 21 production output files, with `manifest.json` at the root. It excludes source maps, environment files, credentials and disposable browser-test hooks.
- Store ZIP SHA-256: `2a09be204fadbe61da684a2608aedabf7d129c367569ab0bc5fa02437d96f55e`.
- The submission dialog retained automatic publication after approval. Existing listing descriptions, artwork, private testing instructions, permissions and data-use declarations were retained; only the homepage URL changed to resolve the dashboard validation failure.
- Pending review confirms submission, not approval or publication of 0.4.10. No live note was created for this release.

## 0.4.8 submission validation

- `bun run check`: lint, type checking, 62 unit tests and production build passed.
- `bun run test:e2e`: all 43 Chromium scenarios passed.
- English and Simplified Chinese short summaries match the package and stay within 132 characters.
- The uploaded ZIP contains 21 production files with `manifest.json` at the root and only `en` / `zh_CN` locales. No source maps, environment files or OpenKey credentials were included.
- Store ZIP SHA-256: `5fd049b25b22ce3fece7b526f71dd6e87aef672a748784539bd706aeef2012ad`.
- Existing private testing credentials and data-use declarations were retained. This copy-only release did not repeat live note creation; capture and attachment recovery were covered by the Chromium regression suite.
