# 3D Settings

Settings → 3D has five sub-tabs: **Display**, **Performance**, **Models**, **Animations**, and **Emotes**. It covers the Live Assistant's entire visual layer: models, stages, motions, emotes, and display settings.

## Display

**Portrait mode** crops the view to upper-body framing. Use **Clipping Height** to adjust how much of the body is visible. Lower values show more. Higher values crop tighter. You can switch portrait mode on and off without reloading the avatar.

**Character Position** controls where the Live Assistant sits on screen (web and extension builds). Set it to **Last Location** and the position you drag it to is remembered across reloads. Switch it to any preset to snap it back.

| Control            | Default        | Behavior                                                                                          |
| ------------------ | -------------- | ------------------------------------------------------------------------------------------------- |
| Enable Avatar      | On             | Turns the Live Assistant on or off. When off, the app falls back to chat-only mode.               |
| Reload Avatar      | -              | Only when avatar is on. Reloads the scene immediately.                                            |
| Portrait Mode      | Off            | Only when avatar is on. Switches to tighter upper-body framing.                                   |
| Clipping Height    | Model preset   | Only when Portrait Mode is on. Lower values show more body. Higher values crop more aggressively. |
| Character Position | Runtime preset | Only on web/extension runtimes. Preset placements including `Last Location`.                      |

## Performance

If the Live Assistant runs slowly or drops frames, work through this list in order. Each step has a bigger impact than the next:

1. **Render Quality** → drop to **Low**. This is usually the biggest single win.
2. **Frame Rate Limit** → cap at `30 FPS`. The Live Assistant still looks smooth at 30.
3. **Physics Simulation** → turn off. Hair and cloth physics are expensive.
4. If you're on **Custom** quality: drop **Anti-Aliasing (MSAA)** to `1x` and turn off **Bloom Effect**.

| Control            | Default  | Behavior                                                                               |
| ------------------ | -------- | -------------------------------------------------------------------------------------- |
| Physics Simulation | On       | Enables hair and cloth physics reactions.                                              |
| Physics Engine     | Bullet   | `Bullet Physics (Recommended)` or `Havok Physics`. Only when Physics is on.            |
| Frame Rate Limit   | `60 FPS` | `15`, `24`, `30`, `60`, `90`, or `Native`. `Native` warns about high-refresh monitors. |
| Render Quality     | Medium   | `Low`, `Medium`, `High`, `Ultra`, or `Custom`.                                         |

### Render quality presets

| Preset | Effect                                             |
| ------ | -------------------------------------------------- |
| Low    | Minimal effects, highest performance               |
| Medium | Balanced quality, subtle bloom                     |
| High   | Better edges and soft glow                         |
| Ultra  | Strongest built-in quality with full anti-aliasing |
| Custom | Exposes every post-processing control individually |

### Custom quality controls

::: details Expand custom quality controls
| Control | Default | Behavior |
| --- | --- | --- |
| Anti-Aliasing (MSAA) | `2x` | `1x`, `2x`, `4x`, or `8x`. Higher values cost more GPU. |
| FXAA | On | Fast anti-aliasing without MSAA overhead. |
| Bloom Effect | On | Glow on bright areas. Turning it off hides all bloom sliders. |
| Bloom Threshold | `0.9` | How bright an area needs to be to bloom. |
| Bloom Intensity | `0.2` | Bloom strength. |
| Bloom Scale | `0.5` | Bloom contribution scale. |
| Bloom Kernel Size | `32` | `16`, `32`, `48`, or `64` for tighter or wider glow. |
| Contrast | `1.2` | Final image contrast. |
| Exposure | `1.05` | Final image brightness. |
| Saturation | `15` | Color richness, -50 to 50. |
| Reset to Defaults | - | Restores all custom-quality controls to the values above. |
:::

## Models

Manages character models and stages together.

### Adding a custom avatar

Models must be packaged as a ZIP file. The ZIP must contain the `.pmx` file plus every texture image it references. The PMX file embeds relative paths to its textures, so those textures need to exist at the same relative paths inside the ZIP. Standard MMD model packages already have this structure. If you downloaded an MMD model, zip the whole folder as-is.

**Typical ZIP structure:**

```
MyModel.pmx
tex/
  body.png
  face.png
  hair.png
```

If textures are missing from the ZIP the import will still succeed but the model will render with gray or transparent surfaces where textures should be.

1. Hit **Upload PMX Model (ZIP)** and select your file.
2. Wait for the import. If something is wrong with the package, an error panel will tell you what's missing.
3. Find the new model in the list, toggle it as **default**.
4. Go back to **Display** and hit **Reload Avatar** (or use the Reload button in the Live Assistant controls).

The built-in **VAssist Default** model is always available as a fallback. It stays in the list even when a custom model is active.

To control which parts of a model are visible (hide accessories, swap textures, etc.), expand the model's settings chevron. Textures and mesh parts are each listed individually with toggles.

### Character models

| Control                | Behavior                                                                         |
| ---------------------- | -------------------------------------------------------------------------------- |
| Upload PMX Model (ZIP) | Import a zipped PMX package. Shows progress and an error panel if parsing fails. |
| `VAssist Default`      | Built-in model. Active when no custom model is set as default.                   |
| Settings chevron       | Expands texture and mesh-part toggles for that model.                            |
| Texture buttons        | Toggle individual textures on/off, grouped by type.                              |
| Mesh part buttons      | Toggle individual mesh parts on/off, grouped by category.                        |
| Custom model row       | Shows name and file size. Supports rename, delete, and default toggle.           |

### Adding a custom stage

Same structure as avatar model ZIPs: a `.pmx` stage file plus all its texture images at the correct relative paths. Hit **Upload PMX Stage (ZIP)** to import, then toggle it as default.

Select **No Stage** to render the avatar against a transparent or neutral background.

### Stages

| Control                | Behavior                                                          |
| ---------------------- | ----------------------------------------------------------------- |
| Upload PMX Stage (ZIP) | Import a zipped stage. Shows progress and error feedback.         |
| No Stage row           | Default when no custom stages are installed.                      |
| Stage row              | Shows name and size. Supports rename, delete, and default toggle. |

## Animations

Combines the motion library with the category-based playback manager. Imported motions don't play until you assign them to at least one animation category.

### Importing motions and assigning categories

VMD files do not need to be zipped. Select the `.vmd` files directly. You can pick multiple files in one go.

1. Hit **Upload VMD Animations** and pick one or more `.vmd` files. You can import multiple at once.
2. After upload, find a motion in the list and expand its **category chevron**.
3. Toggle on the animation categories this motion should be used in: `idle`, `thinking`, `celebrating`, `walking`, or `talking`.

You can assign the same motion to multiple categories. The Live Assistant randomly picks from all enabled motions in a category, so adding more variety means more natural-looking behavior. The default built-in animations stay as a baseline. VAssist won't let you disable the last remaining motion in any category.

The **Animation Management** section below the library lets you enable or disable individual built-in and custom motions per category without re-importing them.

### Motion library

| Control               | Behavior                                                                       |
| --------------------- | ------------------------------------------------------------------------------ |
| Upload VMD Animations | Import one or more VMD files at once.                                          |
| Motion row            | Name, size, rename, delete.                                                    |
| Category chevron      | Opens per-motion category assignment.                                          |
| Animation Categories  | Assign a motion to `idle`, `thinking`, `celebrating`, `walking`, or `talking`. |

### Animation management

One category section per bucket: `idle`, `thinking`, `celebrating`, `walking`, `talking`.

| Section element         | Behavior                                                                     |
| ----------------------- | ---------------------------------------------------------------------------- |
| Category header         | Shows enabled counts for built-in and custom animations.                     |
| Default Animations      | Enable or disable built-in animations in that category.                      |
| Custom Animations       | Enable or disable imported motions assigned to that category.                |
| Last-enabled protection | The toggle disables itself if turning it off would leave the category empty. |

## Emotes

Emotes are named, triggerable reactions. Each one plays a sound, runs a VMD motion on the avatar, and optionally moves the camera. You trigger them from the live emote panel in the Live Assistant controls.

### Creating an emote

You need at least an audio file and a VMD motion file. Camera data is optional but adds a cinematic touch.

1. Give the emote a **name**. This is how it shows up in the panel.
2. Optionally add **categories** (comma-separated tags) to group related emotes together in the filter.
3. Upload the **audio** file.
4. Upload the **motion** VMD file.
5. Optionally upload a **camera** VMD file.
6. Hit **Upload Emote**.

To import many emotes at once from a collection, use **Import ZIP Package** instead of creating them one by one.

Once an emote is in the library:

- Use **category filter** to find it by tag
- Toggle **visibility** to hide an emote from the panel without deleting it. Useful for keeping a library clean without losing assets
- Open the **category chevron** to set it as an **auto-play** emote in one of the animation states (`general`, `idle`, `thinking`, `celebrating`, `walking`, `talking`). The Live Assistant will play it automatically during that state

### Emote creation controls

| Control            | Behavior                                             |
| ------------------ | ---------------------------------------------------- |
| Emote Name         | Required.                                            |
| Categories         | Comma-separated custom category tags.                |
| Import ZIP Package | Bulk-imports multiple emotes from a ZIP archive.     |
| Upload Audio       | Audio source for the emote.                          |
| Upload Motion      | VMD motion file.                                     |
| Upload Camera      | Optional VMD camera animation.                       |
| Upload Emote       | Starts creation and shows success or error feedback. |

### Emote library

| Control              | Behavior                                                               |
| -------------------- | ---------------------------------------------------------------------- |
| Category filter      | Filter list to `all` or a specific category.                           |
| Delete filtered      | Delete every emote in the current filter scope.                        |
| Emote row            | Rename, delete, or toggle visibility.                                  |
| Visibility toggle    | Hides/shows the emote in the emote panel without deleting it.          |
| Category chevron     | Opens auto-play category assignment.                                   |
| Auto-play Categories | `general`, `idle`, `thinking`, `celebrating`, `walking`, or `talking`. |
