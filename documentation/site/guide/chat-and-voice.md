# Chat and Voice

The main chat combines typed conversation, attachments, voice conversation, spoken reply playback, and companion reactions after setup.

<figure class="doc-figure">
	<img src="/assets/chat.png" alt="VAssist chat interface with message history and chat input visible." />
	<figcaption>The full chat view is where longer conversations, attachments, voice conversation, and saved history live.</figcaption>
</figure>

## Open the main chat

- The floating chat control opens the full conversation view instead of the quicker page tools.
- If you set a keyboard shortcut for `Open Chat`, you can launch the same chat view without clicking through the UI.
- If the avatar is disabled, VAssist falls back to a chat-first shell and uses the chat window position setting instead of the model position.
- Desktop can also work with a separate input window, but it still feeds the same main chat.

## Send a message with or without media

1. Type in the chat input.
2. Add images or audio when you want the model to work from attached media as well as text.
3. Drag text, images, or audio into the chat when that is faster than browsing for files.
4. Send the request and watch the answer stream in.

The chat input is built for mixed requests, so you do not have to choose between plain text and media-first conversations.

## What you can do while a reply is coming in

- Watch the response stream in instead of waiting for the full answer at the end.
- Let the current TTS provider speak the response when speech output is enabled.
- Keep typing, attach more media, or move to another saved chat without leaving the main chat view.
- If `Smooth Response Animation` is enabled, the chat shell animates as streaming text grows.

## Message actions you will use often

| Action | What it does |
| --- | --- |
| Copy message | Copies the current message text. |
| Edit message | Lets you change your own sent message and keep or remove attached images and audio before resending. |
| Regenerate response | Creates another assistant answer from the same point in the conversation. |
| Play or stop TTS | Replays the assistant message through the active speech provider when TTS is enabled. |
| Previous branch / Next branch | Moves between alternate replies when a message has more than one generated branch. |

This branch system matters when you are comparing answers instead of throwing the previous one away.

## Voice conversation mode

- Turn on `Voice Mode` when you want a spoken back-and-forth instead of typing every turn.
- VAssist records microphone audio, sends it through the active STT provider, forwards the transcript to the current LLM, and can speak the reply through the active TTS provider.
- You can stop voice mode, interrupt speech, or go back to typed chat at any time.
- Voice quality depends mostly on the providers and models you chose in setup or settings, not on the chat shell itself.

## Device controls inside chat

- Choose the microphone you want to use instead of relying on the system default.
- On desktop, you can also work with a camera source and screen share from the chat view.
- Camera and screen previews stay visible as floating live previews while you work.

The full capture guide is covered in [Camera and Screen Share](/guide/camera-and-screen-share).

## Companion feedback while you chat

- If the companion is enabled, short assistant output can appear in the floating chat bubble near the model.
- Spoken output can drive lip sync and companion state changes.
- If an emote is active, the playback bar can show progress, pause or resume playback, and optionally show time labels.

## Related guides

<div class="doc-link-list">
	<a href="/guide/chat-history-and-branches">Open chat history and branches</a>
	<a href="/guide/ai-toolbar">Open AI toolbar guide</a>
	<a href="/guide/virtual-companion">Open virtual companion guide</a>
</div>