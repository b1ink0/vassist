# Virtual Companion

The virtual companion is the live character layer that stays visible beside chat and page tools. It is not just decoration. It can react while you chat, switch avatars and stages, play emotes, and expose camera controls directly from the live interface.

<figure class="doc-figure">
	<img src="/assets/companion.png" alt="Virtual companion with live avatar controls visible." />
	<figcaption>The companion can stay visible while you work, or you can switch to chat-only mode when you want a lighter interface.</figcaption>
</figure>

## What the companion does during normal use

- Shows the current avatar and stage.
- Reacts with animation states such as idle, thinking, talking, walking, and celebration-style motion categories.
- Uses lip sync during spoken playback when the current TTS setup supports it.
- Can show a short floating chat bubble near the model.
- Plays emotes that can combine motion, audio, and camera data.

## Live controls around the companion

The floating control cluster is the fastest way to change what you see without opening the full settings tab.

| Control | What it does |
| --- | --- |
| Avatar list | Opens the live avatar picker with `VAssist Default` plus any uploaded models. |
| Stage button | Switches the same picker between avatar selection and stage selection, including `No Stage`. |
| Emote button | Opens the live emote list so you can trigger an emote immediately. |
| 2D / 3D toggle | Switches between the simpler 2D framing and freer 3D camera behavior. |
| Reset Camera Position | Returns the camera framing to its default state. |
| Lock / Unlock Camera | Freezes or frees camera movement. |
| Position Saving | Turns remembered camera positioning on or off. |

## Move and frame the model

- On runtimes that allow free placement, you can drag the companion to a better on-screen position.
- If you use `Last Location (Remember Position)`, VAssist restores the most recently saved location instead of snapping back to a fixed preset.
- `Portrait Mode` tightens the framing to an upper-body view.
- Standard mode keeps the broader full-body framing.

## Chat bubble and playback bar

- The chat bubble appears near the model for short assistant output and then hides itself after a short delay.
- The emote playback bar can show progress, pause or resume playback, and optionally show current and total time.
- These playback helpers are useful when an emote is more than a quick reaction and you want manual control.

## Chat-only mode is always an option

If you turn avatar loading off, VAssist still works. The interface simply becomes chat-first instead of companion-first. In that mode, the chat position setting matters more than the avatar position or stage.

## Android wallpaper note

Android can use the companion as a live wallpaper view. That changes the role of the companion from a side element into the main visual layer, but it still uses the same model, stage, motion, and emote library underneath.

## Related guides

<div class="doc-link-list">
	<a href="/guide/avatar-motions-and-emotes">Open avatar, motions, and emotes guide</a>
	<a href="/settings/three-d">Open 3D settings reference</a>
	<a href="/guide/chat-and-voice">Open chat and voice guide</a>
</div>