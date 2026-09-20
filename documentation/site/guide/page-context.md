# Page Context

When VAssist is running in the browser (extension or web), it can read the current page and automatically include relevant content in your messages. You do not have to copy and paste anything.

## How it works

Before sending your message to the AI, VAssist uses a quick analysis step to decide whether your question relates to the current page. If it does, it extracts the relevant part of the page and prepends it to your query automatically.

For example:
- You ask "What are the main claims in this article?" while reading a news page. VAssist reads the article text and includes it as context.
- You ask "List the links on this page" while browsing a directory. VAssist extracts the anchor links from the DOM.
- You ask "What does this form do?" VAssist reads the visible form fields and labels.

If your question has nothing to do with the current page, the analysis step returns nothing and no page content is added.

## What types of content it can extract

| Type | What gets included |
| --- | --- |
| Text | Visible body text from the main content area |
| Links | Anchor text and href values on the page |
| Forms | Input labels, field names, and form structure |
| Images | Alt text and src values of page images |
| Tables | Table headers and cell content |
| Code | Code blocks on the page |

The extraction is capped at 4000 characters. If the relevant content is longer, it is truncated to fit.

## When it does not run

Page context extraction is skipped when:
- You have attached images or audio files to your message. Your attachments take precedence as context.
- The question does not appear to need page content (most general questions fall here).
- You are on desktop or Android. Page context only runs in the browser (extension and web).

## Nothing to configure

There is no setting to toggle. Page context injection is always active in the browser when you are using chat or voice mode. If you want to suppress it, attach an image or audio file and the service is bypassed.

## Related guides

<div class="doc-link-list">
  <a href="/guide/chat-and-voice">Chat and voice →</a>
  <a href="/guide/ai-toolbar">AI toolbar →</a>
  <a href="/platforms/extension">Extension platform →</a>
</div>
