# Camera and Screen Share

Desktop builds of VAssist can work with more than plain text. Chat can also use microphone input, live camera, screen share, and draggable media previews.

## What belongs here

- Microphone selection for voice conversation.
- Camera input for live visual context.
- Screen sharing from a chosen monitor or app window.
- Floating previews that stay on screen while you continue working.

## Attach images, audio, and dragged content

The chat input accepts more than typed text.

- Add images when you want the model to see a screenshot, photo, or other visual reference.
- Add audio when you want the conversation to include a recording.
- Drag text, images, or audio straight into the chat when that is faster than browsing for files.

## Microphone and camera basics

- Pick the microphone you want instead of relying on the system default.
- On desktop, you can also choose and switch camera devices.
- Camera state stays aligned with what the main chat is doing.

## Screen share on desktop

When you start screen sharing on desktop, VAssist opens a share picker with two groups:

- `Screens` for whole displays
- `Windows` for individual app windows

From there you choose a source and either `Share` or `Cancel`.

## Draggable live previews

Camera and screen share both use floating preview windows.

- You can drag them to a better position instead of keeping them fixed.
- The previews stay inside the app window bounds.
- Camera preview supports cycling through cameras when more than one device is available.
- Screen previews are wider than camera previews because they are meant for window and display content.

## During voice conversation

Voice conversation still owns the main microphone loop, but desktop capture tools can sit beside it when you need a more multimodal session.

When voice mode ends, VAssist also shuts down desktop camera and screen share sessions so those extra capture sources do not stay running by accident.

## Related guides

<div class="doc-link-list">
  <a href="/guide/chat-and-voice">Open chat and voice guide</a>
  <a href="/platforms/desktop">Open desktop platform guide</a>
</div>