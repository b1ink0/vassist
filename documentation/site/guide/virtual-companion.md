# Live Assistant

The live 3D assistant sits alongside the chat and page tools. It animates, reacts while you talk to it, plays emotes, and stays visible while you work on other things. You can swap avatars, stages, and motions on the fly from the floating controls without touching Settings.

<figure class="doc-figure">
	<img src="/assets/companion.png" alt="Live Assistant with live avatar controls visible." />
	<figcaption>The Live Assistant stays visible while you work. Or switch to chat-only mode and skip the 3D view entirely.</figcaption>
</figure>

## What it does while you use VAssist

- Renders the current avatar and stage.
- Switches between animation states: idle, thinking, talking, walking, celebration.
- Lip-syncs during spoken reply playback when your TTS setup supports it.
- Displays short assistant output in a floating chat bubble near the model.
- Plays emotes: combinations of motion, audio, and optional camera movement.

## The floating button cluster

When the avatar is visible and chat is closed, a vertical stack of buttons sits near the Live Assistant:

| Button        | Icon                             | What it does                                                                                                     |
| ------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Chat button   | AI spark (or X to close)         | Opens the chat. Drag to reposition when in chat-only mode. Shows attachment icon when a file is dragged over it. |
| Zoom control  | + / - / reset                    | Zooms the Live Assistant view in or out, and resets back to default size.                                        |
| Avatar button | person outline                   | Opens the avatar and stage picker panel.                                                                         |
| Emote button  | music note (spins while playing) | Opens the emote list.                                                                                            |
| Reload button | refresh arrow                    | Reloads the page.                                                                                                |

These buttons hide when the chat is open.

## Switching avatars and stages

Click the **avatar button** to open the picker panel. It lists all your imported models starting with **VAssist Default**.

- Click any model to switch immediately. A check mark shows the current selection.
- Click the **stage icon** (box) in the camera controls row below the list to switch the panel to stage selection. Click the **person icon** to switch back to avatars.
- **No Stage** renders the avatar with no background.

## Camera controls (below the avatar list)

When the avatar panel is open, a row of small buttons appears below the model list:

| Button                                               | What it does                                                             |
| ---------------------------------------------------- | ------------------------------------------------------------------------ |
| 2D / 3D (highlighted when 3D)                        | Toggles between flat 2D framing and a free 3D camera.                    |
| Reset camera (refresh icon)                          | Snaps the camera back to its default position.                           |
| Lock / Unlock (lock icon, highlighted when unlocked) | Freezes or releases camera movement.                                     |
| Pin position (pin icon, highlighted when saving)     | Saves dragged camera placement across sessions. Turn off to stop saving. |
| Stage toggle (box / person icon)                     | Switches the panel between the avatar list and stage list.               |

## Playing emotes

Click the **emote button** (music note) to open the emote panel.

1. Use the **category dropdown** at the top to filter by category.
2. Click any emote name to play it immediately. A spinning icon marks the currently playing emote.
3. Click the emote button again to close the panel. The emote keeps playing in the background.

The emote panel also shows an auto-play toggle and category selector so the Live Assistant plays emotes automatically during matching animation states.

## Emote playback bar

When an emote is playing, a progress bar appears near the Live Assistant showing elapsed time and duration. You can pause, resume, or stop from there.

## Positioning and framing

- Drag the Live Assistant to reposition it on supported runtimes.
- Turn on **Pin position** (pin icon in camera controls) to remember where you dragged it. Turn it off and the Live Assistant resets to the preset position on next load.
- **Portrait Mode** (Settings → 3D) crops to an upper-body framing. Standard mode shows the full body.

## Chat-only mode

If you turn the avatar off, VAssist keeps working. It just becomes a chat-first interface. The **Chat Window Position** setting in Settings → UI controls where the chat sits in that mode.

## Android live wallpaper

On Android, the Live Assistant can run as a live wallpaper. It's the same model, motions, and emote library, just rendered as a wallpaper view instead of an in-app overlay. Do setup in the main app first. The wallpaper reads those saved settings.

## Related guides

<div class="doc-link-list">
	<a href="/guide/avatar-motions-and-emotes">Avatar, motions, and emotes →</a>
	<a href="/guide/chat-and-voice">Chat and voice →</a>
	<a href="/settings/three-d">3D settings →</a>
</div>
