# Avatar, Motions, and Emotes

The 3D settings tab controls how the companion looks and moves. It manages the companion's MMD-style assets, including PMX or BPMX models, PMX stages, VMD or BVMD motions, portrait framing, and emote assets.

## The five parts of 3D settings

| Sub-tab | What it is for |
| --- | --- |
| Display | Turn the avatar on or off, reload it, switch portrait mode, and choose a saved position preset. |
| Performance | Balance physics, frame rate, and render quality against device performance. |
| Models | Import PMX avatar models and PMX stages, then choose defaults and fine-tune parts. |
| Animations | Import VMD motions and decide which categories they can play in. |
| Emotes | Build reusable reactions that combine audio, motion, and optional camera data. |

## Models and stages

- Upload zipped PMX model packages for custom avatars.
- Upload zipped PMX stage packages when you want a custom scene instead of the default stage.
- Use `VAssist Default` when you want to go back to the bundled avatar.
- Use `No Stage` when you want the avatar without a custom stage.
- Rename, delete, or set a default model or stage directly from the saved asset list.

Both built-in and custom models can also expose texture and mesh-part toggles when you want more detailed visual control.

## Display and camera setup

- `Enable Avatar` decides whether the companion loads at all.
- `Reload Avatar` reapplies model and scene changes immediately.
- `Portrait Mode` switches to the tighter upper-body framing.
- `Clipping Height` changes how aggressively portrait mode crops the model.
- `Character Position` includes `Last Location (Remember Position)` when you want dragged placement to stick.

Live 2D and 3D camera switching is available from the companion controls while you use the app. The settings tab is where you define the default behavior and persistent placement rules.

## Performance controls

Performance matters more once you start using heavier models, stages, physics, or higher quality post-processing.

- Turn physics on or off.
- Choose the physics engine.
- Set a frame-rate cap.
- Use a built-in quality preset or open the full custom quality block.

Custom quality lets you tune anti-aliasing, bloom, contrast, exposure, saturation, and related post-processing settings.

## Custom motions

- Upload one or more VMD files into the motion library.
- Rename or delete motions later.
- Assign imported motions to playback categories such as `idle`, `thinking`, `celebrating`, `walking`, or `talking`.
- Enable or disable built-in and custom animations per category.

VAssist prevents you from disabling the last remaining animation in a category, so a category never ends up empty by mistake.

## Emotes

Emotes are the most expressive asset type because they can combine more than one kind of media.

| Emote part | What it adds |
| --- | --- |
| Audio | The sound that should play with the emote. |
| Motion | The VMD motion clip that drives the character. |
| Camera | An optional VMD camera variant for a more directed presentation. |

You can create emotes one by one or import them in bulk from a ZIP package.

## Managing the emote library

- Give emotes names and categories.
- Filter the library by category.
- Hide an emote without deleting it.
- Delete one emote or clear all emotes in the current filtered category.
- Assign auto-play categories so certain emotes can be used automatically during matching states.

Once an emote is in the library, you can trigger it from the live emote panel while using the companion.

## Related guides

<div class="doc-link-list">
  <a href="/guide/virtual-companion">Open virtual companion guide</a>
  <a href="/settings/three-d">Open 3D settings reference</a>
</div>