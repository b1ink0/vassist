# Extension

The browser extension injects VAssist into normal web pages. The companion, chat, and toolbar are right there while you browse. You don't leave the current tab to use them.

## What's different in the extension

| Extension behavior                                   | Why it matters                                                                               |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Injection happens per tab                            | VAssist appears inside the current page instead of living in its own desktop window.         |
| Auto-load can be turned off                          | You can require manual start if you do not want VAssist injected into every supported page.  |
| The UI is isolated from page styling                 | The extension tries to avoid breaking when the site has aggressive CSS.                      |
| Background and offscreen contexts do privileged work | Audio, model, and browser-extension work can keep running without blocking the visible page. |
| Page context is automatically read                   | When you ask a question that relates to the current page, VAssist extracts the relevant part and includes it in your query automatically. |

## Page context

When VAssist is active in the extension (or any browser environment), it can automatically read the current page to answer questions about it. Ask "summarize this article" or "what does this form do?" and VAssist extracts the relevant content from the DOM and includes it in your message before sending it to the AI. You do not need to copy anything.

This runs on every chat and voice message. If your question has nothing to do with the page, the extraction step is skipped. If you have images or audio attached, the extraction is also skipped.

[Page context guide →](/guide/page-context)

## AI and voice options in the extension

- Chrome AI can power some local browser-side features when the right browser version and flags are available.
- OpenAI, OpenAI-compatible, and Ollama backends are available when you want remote or server-based providers.
- Kokoro gives the extension a browser-side local TTS option.
- The extension can also talk to local loopback services running on your machine when those services expose compatible endpoints.

## Under the hood

The extension uses a content script for page injection, a background service worker for privileged extension tasks, and an offscreen document when audio or worker-heavy tasks need their own browser context. Most of the visible UI is mounted into a shadow root so host-page CSS does not leak into it.

## Related pages

<div class="doc-link-list">
	<a href="/guide/ai-toolbar">AI toolbar →</a>
	<a href="/settings/ui">UI settings →</a>
	<a href="/architecture/ai-and-media-stack">AI and media stack →</a>
</div>
