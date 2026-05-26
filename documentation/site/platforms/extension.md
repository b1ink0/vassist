# Extension

The browser extension keeps VAssist inside normal web pages instead of moving the experience into a separate desktop window or Android app.

## What the extension is best at

- quick in-page rewrite, summarize, translate, and dictation tasks
- keeping chat and the companion available while you stay on the current site
- working from selected text, focused inputs, and hovered images without switching apps
- using browser-native Chrome AI features when the current Chrome build supports them

## What feels different in extension mode

| Extension behavior | Why it matters |
| --- | --- |
| Injection happens per tab | VAssist appears inside the current page instead of living in its own desktop window. |
| Auto-load can be turned off | You can require manual start if you do not want VAssist injected into every supported page. |
| The UI is isolated from page styling | The extension tries to avoid breaking when the site has aggressive CSS. |
| Background and offscreen contexts do privileged work | Audio, model, and browser-extension work can keep running without blocking the visible page. |

## AI and voice options in the extension

- Chrome AI can power some local browser-side features when the right browser version and flags are available.
- OpenAI, OpenAI-compatible, and Ollama backends are available when you want remote or server-based providers.
- Kokoro gives the extension a browser-side local TTS option.
- The extension can also talk to local loopback services running on your machine when those services expose compatible endpoints.

## What the extension does not try to be

- It is not a standalone desktop shell with tray behavior.
- It does not replace Android wallpaper mode.
- It is best when the page itself is part of the job and you want AI tools to stay close to the current content.

## Under the hood

The extension uses a content script for page injection, a background service worker for privileged extension tasks, and an offscreen document when audio or worker-heavy tasks need their own browser context. Most of the visible UI is mounted into a shadow root so host-page CSS does not leak into it.

## Related pages

<div class="doc-link-list">
	<a href="/guide/ai-toolbar">Open AI toolbar guide</a>
	<a href="/settings/ui">Open UI settings reference</a>
	<a href="/architecture/ai-and-media-stack">Open AI and media stack reference</a>
</div>