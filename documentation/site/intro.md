# Start Here

VAssist is an AI assistant that runs on desktop, Android, and as a browser extension. It has three main parts: a full chat window, on-page tools that appear when you select text or focus an input, and an animated 3D Live Assistant that stays visible while you work.

<figure class="doc-figure">
  <img src="/assets/overview.gif" alt="VAssist overview showing chat, toolbar, and Live Assistant use." />
  <figcaption>Chat, the toolbar, and the Live Assistant: the three main ways you'll actually use VAssist.</figcaption>
</figure>

::: tip Haven't tried it yet?
The [live demo](https://vassist-demo.vercel.app) runs in your browser with no install needed.
:::

## Where do you want to start?

<div class="doc-grid">
  <a class="doc-card doc-card-link" href="./getting-started/installation">
    <h3>Install VAssist</h3>
    <p>Download links and install steps for desktop (Windows/macOS/Linux), Android, and the Chrome extension.</p>
    <p class="doc-card-cta">Installation guide →</p>
  </a>
  <a class="doc-card doc-card-link" href="./getting-started/setup-wizard">
    <h3>First-run setup</h3>
    <p>The setup wizard runs on first launch. It connects your AI provider, voice input, voice output, and picks a Live Assistant mode.</p>
    <p class="doc-card-cta">Setup guide →</p>
  </a>
  <a class="doc-card doc-card-link" href="./guide/">
    <h3>Using VAssist</h3>
    <p>Once setup is done: chat, toolbar, voice, the Live Assistant, and everything in between.</p>
    <p class="doc-card-cta">Usage guides →</p>
  </a>
  <a class="doc-card doc-card-link" href="./architecture/packages-and-integration">
    <h3>Use VAssist As A Package</h3>
    <p>Install <code>@vassist/react</code> or <code>@vassist/embed</code> from npm. Route AI, TTS, and STT through your own backend via the host bridge. Control which features users can access, lock down settings, and customize the UI to fit your project.</p>
    <p class="doc-card-cta">Integration docs →</p>
  </a>
</div>

If you are embedding VAssist, start with [Package integration](/architecture/packages-and-integration). That page covers the decisions you usually need first: package choice, shell entry point, provider ownership, request execution, and host control surfaces.

## The three main features

### Full chat

The chat window is where longer conversations happen. You can attach images and audio, use voice mode for back-and-forth spoken conversation, browse saved chats, and branch off alternate replies from any message.

- [Chat and voice](/guide/chat-and-voice): typed chat, attachments, voice mode, message actions
- [Saved chats and branches](/guide/chat-history-and-branches): history, search, rename, branched replies
- [Camera and screen share](/guide/camera-and-screen-share): desktop capture alongside chat

### On-page tools (AI toolbar)

Select text on any page and a small toolbar appears next to it. Rewrite, summarize, translate, look up a word, or dictate into a focused input field, all without opening the full chat. Works on selected text, focused inputs, and hovered images.

- [AI toolbar guide](/guide/ai-toolbar)

### Live Assistant

A 3D animated assistant that stays visible while you work. It reacts during chat, lip-syncs during voice playback, and you can swap models, stages, and motions. On Android it can run as a live wallpaper.

- [Live Assistant](/guide/virtual-companion): the floating avatar, controls, chat bubble
- [Avatar, motions, and emotes](/guide/avatar-motions-and-emotes): importing MMD models, VMD motions, emote libraries

## Looking for something specific?

- [Settings reference](/settings/): every toggle and picker, tab by tab
- [Platform differences](/platforms/desktop): what's different on desktop vs Android vs extension
- [Package integration](/architecture/packages-and-integration): React and browser package docs, secure host bridge transport, runtime control APIs, and embedding guides
- [Technical reference](/architecture/overview): how VAssist is built, what engines it uses, where things live in the repo
