# Chat and Voice

The chat window is where full conversations happen: typed or spoken, with attachments, and saved history.

<figure class="doc-figure">
	<img src="/assets/chat.png" alt="VAssist chat interface with message history and chat input visible." />
	<figcaption>The full chat view: messages, attachments, voice mode, and history all in one place.</figcaption>
</figure>

## Opening chat

- Click the floating **chat button** (AI spark icon) to open the chat view.
- On desktop, a lightweight input window is also available separately from the main window.
- If the avatar is off, VAssist opens in chat layout by default.

## Starting and continuing conversations

Each time you send your first message in a blank session, VAssist creates a new conversation and saves it automatically.

To reopen an old conversation, click **Chat History** (clock icon, bottom-left of the chat window) to browse saved chats. Select any entry to pick up where you left off.

[Saved chats and branches](/guide/chat-history-and-branches)

## Chat window controls

The bottom bar of the chat window has three groups of buttons.

**Left**

| Button       | Icon  | What it does             |
| ------------ | ----- | ------------------------ |
| Settings     | gear  | Opens settings inline.   |
| Chat History | clock | Opens the history panel. |

**Center**

| Button   | Icon                     | What it does                                                          |
| -------- | ------------------------ | --------------------------------------------------------------------- |
| Stop     | square (red when active) | Stops AI generation or TTS playback mid-stream.                       |
| New Chat | plus                     | Starts a blank conversation. The current one is saved.                |
| Close    | X                        | Closes the chat panel. Only shown when the Live Assistant is visible. |

**Right**

| Button                | Icon                                | What it does                                              |
| --------------------- | ----------------------------------- | --------------------------------------------------------- |
| Hide / Show character | eye-off / eye                       | Hides or shows the Live Assistant without closing chat.   |
| Temp mode             | pin icon (star when active, yellow) | When active, the current session is not saved to history. |

## Typing and attaching files

Type in the text area. The toolbar sits below it:

| Button     | State                                               | What it does                                                      |
| ---------- | --------------------------------------------------- | ----------------------------------------------------------------- |
| Image      | Blue with count when attached                       | Opens a file picker to attach images.                             |
| Audio      | Purple with count when attached                     | Opens a file picker to attach audio files.                        |
| Mic        | Red pulse when recording, hourglass when processing | Records a voice clip and attaches it as audio. Tap again to stop. |
| Voice Mode | Phone icon                                          | Switches to hands-free voice conversation mode.                   |
| Close      | X                                                   | Closes the input area.                                            |
| Send       | Paper plane, disabled when nothing to send          | Sends the message.                                                |

You can also **drag and drop** images or audio files directly onto the input area.

## While a reply is coming in

Responses stream in as they are generated. While streaming:

- The **Stop** button (center of the bottom bar) cancels generation or TTS at any point.
- If TTS is on, the reply is spoken as it streams.
- You can keep typing while the reply comes in. Sending a new message will not interrupt the current one.
- **Smooth Response Animation** (Settings and UI) controls whether the container height animates as text grows.

## Message actions

Hover or tap a message to see its action menu:

| Action                 | What it does                                                                       |
| ---------------------- | ---------------------------------------------------------------------------------- |
| Copy                   | Copies the message text.                                                           |
| Edit                   | Edits your sent message and resends. You can also remove attachments from here.    |
| Regenerate             | Generates another reply from the same prompt. Both versions are saved as branches. |
| Play / Stop TTS        | Replays an assistant message through your TTS provider.                            |
| Previous / Next branch | Steps through alternate replies for that message.                                  |

## Voice mode

Voice mode replaces the text input with a live conversation bar. Tap the **phone icon** to start.

When voice mode is active the bar shows:

- A status label that changes as the conversation progresses: **Listening**, **Thinking**, **Speaking**.
- **Interrupt** button (hand-stop icon, red) when the assistant is speaking. Tap it to cut the reply short.

The right side of the voice mode bar has these controls:

| Control                                              | What it does                                                                                                                                                |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mic selector (microphone + arrow)                    | Picks which microphone to use. Dropdown lists all detected devices.                                                                                         |
| Image attach (image icon, blue when attached)        | Attaches an image to the next voice message.                                                                                                                |
| Camera (camera icon, green + pulse when active)      | Starts a camera feed. A draggable preview floats alongside the chat. Select a specific camera from the arrow dropdown next to it. Not available on Android. |
| Screen share (screen icon, blue + pulse when active) | Starts a screen share session. A draggable preview appears. Not available on Android.                                                                       |
| Close (X)                                            | Exits voice mode and returns to typing.                                                                                                                     |

Speak naturally. VAssist transcribes what you say, sends it, gets a reply, and speaks it back. Then it returns to **Listening** and waits for you again.

If you start talking while the assistant is still speaking, Voice Activity Detection (VAD) automatically detects your voice and interrupts the current reply. You do not need to tap the interrupt button for this. Just speak.

::: info
Camera and screen share are available in voice mode on desktop and the browser extension. They are not available on Android.
:::

::: info
Voice quality depends on your STT and TTS provider setup. If transcription or speech output is not working, check Settings and STT and Settings and TTS.
:::

## AI persona and system prompts

The AI behavior is controlled by the active **system prompt profile** in Settings and LLM and Profiles. The default is a general assistant. You can create your own: a coding assistant, a writing partner, a specific character. Changes apply to the next message.

## Live Assistant reactions during chat

- Spoken output drives lip sync and can shift the Live Assistant animation state.
- If an emote is playing, a progress bar shows in the Live Assistant area.

## Related guides

<div class="doc-link-list">
	<a href="/guide/chat-history-and-branches">Saved chats and branches →</a>
	<a href="/guide/ai-toolbar">AI toolbar →</a>
	<a href="/guide/virtual-companion">Live Assistant →</a>
	<a href="/guide/camera-and-screen-share">Camera and screen share →</a>
</div>
