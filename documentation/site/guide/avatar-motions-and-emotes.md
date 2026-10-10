# Avatar, Motions, and Emotes

Settings → 3D is where you manage everything that shapes how the Live Assistant looks and moves: MMD-style models and stages, VMD motions, and emotes. It's split into five sub-tabs.

| Sub-tab     | What's here                                                |
| ----------- | ---------------------------------------------------------- |
| Display     | Avatar on/off, reload, portrait mode, position preset      |
| Performance | Physics, frame rate cap, render quality                    |
| Models      | Import and manage PMX avatar models and PMX stages         |
| Animations  | Import VMD motions, assign them to animation categories    |
| Emotes      | Build named reactions from audio, motion, and camera clips |

## Models and stages

Upload models and stages as zipped PMX packages. Once imported, you can rename, delete, set a default, or expand a model to toggle individual textures and mesh parts.

- **VAssist Default**: the bundled avatar, always available
- **No Stage**: renders the avatar without any background stage
- Custom models replace the default when you mark one as the default

## Display and camera

- **Enable Avatar**: if this is off, VAssist runs as chat-only
- **Reload Avatar**: applies any model/scene changes without restarting
- **Portrait Mode**: upper-body crop instead of full body. **Clipping Height** adjusts how aggressively it crops.
- **Character Position**: includes **Last Location** so dragged placement sticks across restarts

You can also switch between 2D and 3D camera modes from the Live Assistant controls without touching Settings.

## Performance

Physics (hair, cloth), frame rate cap, and render quality are here. The defaults are reasonable for most machines. If the avatar is noticeably slow, drop the render quality or cap the frame rate first.

Setting Render Quality to **Custom** unlocks individual controls for anti-aliasing (MSAA), FXAA, bloom, contrast, exposure, and saturation.

## Custom motions

Import VMD files into the motion library, then assign them to animation categories: `idle`, `thinking`, `celebrating`, `walking`, or `talking`. Each category can hold multiple motions. The Live Assistant picks from them randomly during the matching state.

::: tip
VAssist won't let you disable the last remaining motion in a category, so you can't accidentally leave a category empty.
:::

## Emotes

An emote is a named, triggerable reaction that can combine:

| Part   | What it contributes                                           |
| ------ | ------------------------------------------------------------- |
| Audio  | Sound that plays with the emote                               |
| Motion | The VMD clip that drives the character                        |
| Camera | An optional VMD camera clip for a more cinematic presentation |

Create them one by one, or bulk-import from a ZIP. Once they're in the library you can trigger them from the live emote panel. You can also assign categories so emotes fire automatically during matching animation states.

Library management: name, category, hide without deleting, delete one, or clear a whole category.

## Related guides

<div class="doc-link-list">
  <a href="/guide/virtual-companion">Live Assistant →</a>
  <a href="/settings/three-d">3D settings reference →</a>
</div>
