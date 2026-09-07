# Chrome Web Store release

- Existing item: https://chromewebstore.google.com/detail/cahpbdbfdfnmoachkjmcfgbbnmjcbpej
- Source: https://github.com/Rabithua/rote-extension
- Support: https://github.com/Rabithua/rote-extension/issues
- Privacy: https://github.com/Rabithua/rote-extension/blob/main/docs/PRIVACY.md
- Version: 0.4.4
- Verified submission status on September 7, 2026: Pending review; publish automatically after approval.

Build with `bun run check`, then run `bun run test:e2e`. Create the store ZIP from the **contents** of `.output/chrome-mv3`, with `manifest.json` at its root. Do not upload the developer bundle containing a `chrome-mv3` parent folder, docs or source. Review credentials belong only in the dashboard's private testing instructions and must never enter the source or package.

English and Simplified Chinese listing descriptions explain webpage bookmarks, exact text selections, supported-page captures, images, default tags/visibility and recovery. Avoid enumerating platform names: the initial platform list triggered the Yellow Argon keyword-stuffing check. Current global screenshots show settings/recent captures, a real paper capture and generic webpage-save feedback. Old screenshots and promotional videos were removed.

The review key was verified for private text creation, attachment upload/finalize and note retrieval. It must remain available throughout review. Saved data is disclosed as website content, authentication information, browsing-history data limited to chosen URLs, and identifying author metadata. No remote code, ads or analytics are used.
