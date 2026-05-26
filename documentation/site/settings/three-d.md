# 3D Settings

The 3D tab is split into five sub-tabs in this order: Display, Performance, Models, Animations, and Emotes. It owns everything related to the Babylon-rendered companion, from whether the avatar loads at all to how PMX models, motions, stages, and emotes are stored.

## Display sub-tab

| Control | Default | Visibility | Behavior |
| --- | --- | --- | --- |
| Enable Avatar | On | All runtimes | Turns the rendered companion on or off. When off, the app falls back to chat-only mode. |
| Reload Avatar | N/A | Only when Enable Avatar is on | Reloads the scene so model or scene configuration changes are applied immediately. |
| Portrait Mode | Off | Only when Enable Avatar is on | Switches from full-body framing to a tighter upper-body portrait framing. |
| Clipping Height | Model preset dependent | Only when Portrait Mode is on | Moves the portrait clipping plane. Lower values show more body. Higher values crop more aggressively. |
| Character Position | Runtime preset | Only on shared web or extension-style runtimes where manual selection is allowed | Selects a preset position, including `Last Location` to restore the most recently dragged position. |

## Performance sub-tab

| Control | Default | Visibility | Behavior |
| --- | --- | --- | --- |
| Physics Simulation | On | All runtimes | Enables or disables hair, cloth, and similar physics reactions. |
| Physics Engine | Bullet | Only when Physics Simulation is on | Chooses `Bullet Physics (Recommended)` or `Havok Physics`. |
| Frame Rate Limit | `60 FPS` | All runtimes | Caps rendering at `15`, `24`, `30`, `60`, `90`, or `Native`. `Native` warns about high-refresh monitors. |
| Render Quality | Medium | All runtimes | Selects `Low`, `Medium`, `High`, `Ultra`, or `Custom`. |

### Render quality presets

| Preset | Intended effect |
| --- | --- |
| Low | Minimal effects, highest performance |
| Medium | Balanced quality, subtle bloom |
| High | Better edges and soft glow |
| Ultra | Highest built-in quality with stronger anti-aliasing |
| Custom | Reveals every advanced post-processing control |

### Custom quality controls

When Render Quality is set to `Custom`, the following controls appear:

| Control | Default | Behavior |
| --- | --- | --- |
| Anti-Aliasing (MSAA) | `2x` | Selects `1x`, `2x`, `4x`, or `8x`. Higher values cost more GPU time. |
| FXAA | On | Adds fast anti-aliasing without requiring MSAA. |
| Bloom Effect | On | Enables glow on bright areas. Turning it off hides all bloom-specific sliders. |
| Bloom Threshold | `0.9` | Higher values make only the brightest areas glow. |
| Bloom Intensity | `0.2` | Controls how strong the bloom effect is. |
| Bloom Scale | `0.5` | Controls the bloom contribution scale. |
| Bloom Kernel Size | `32` | Chooses `16`, `32`, `48`, or `64` for tighter or wider glow. |
| Contrast | `1.2` | Adjusts final image contrast. |
| Exposure | `1.05` | Adjusts final image brightness. |
| Saturation | `15` | Adjusts final color richness from `-50` to `50`. |
| Reset to Defaults | N/A | Restores the full custom-quality block to the built-in defaults listed above. |

## Models sub-tab

The Models sub-tab combines character model management and stage management in one scrollable page.

### Custom models

| Control | Behavior |
| --- | --- |
| Upload PMX Model (ZIP) | Imports a zipped PMX model package. Upload state shows progress text while running and an error panel if parsing fails. |
| `VAssist Default` entry | Represents the built-in bundled model. Its toggle becomes active when no custom model is marked as default. |
| Default model settings chevron | Expands grouped texture and mesh-part controls for the built-in model. |
| Texture buttons | Toggle individual detected textures on or off, grouped by texture type. |
| Mesh part buttons | Toggle individual detected mesh parts on or off, grouped by category. |
| Custom model row | Shows model name and file size. |
| Custom model rename | Inline name editing with save and cancel actions. |
| Custom model delete | Removes the stored model package. |
| Custom model default toggle | Marks that model as the active default avatar. |
| Custom model settings chevron | Expands texture and mesh-part toggles for that specific uploaded model. |

### Custom stages

| Control | Behavior |
| --- | --- |
| Upload PMX Stage (ZIP) | Imports a zipped stage package with progress and error feedback. |
| No Stage default row | Appears when no custom stages are installed and keeps the default stage active. |
| Custom stage row | Shows name and size for each saved stage. |
| Stage rename | Inline editing with save and cancel controls. |
| Stage delete | Removes the saved stage asset. |
| Stage default toggle | Marks the selected stage as the default active stage. |

## Animations sub-tab

The Animations sub-tab combines the uploaded motion library with the category-based playback manager.

### Custom animation library

| Control | Behavior |
| --- | --- |
| Upload VMD Animations | Accepts one or more VMD files in one import action. |
| Upload progress and error panels | Show import progress text or parser failure details. |
| Motion row | Displays the motion name and file size. |
| Motion rename | Inline editing with save and cancel controls. |
| Motion delete | Removes the imported motion from storage. |
| Motion category chevron | Opens per-motion category toggles. |
| Animation Categories inside a motion | Lets one imported motion be enabled for `idle`, `thinking`, `celebrating`, `walking`, or `talking`. |

### Animation Management

The lower half of the tab opens one category section per animation bucket. The current categories are:

- `idle`
- `thinking`
- `celebrating`
- `walking`
- `talking`

Each category section shows:

| Section element | Behavior |
| --- | --- |
| Category header | Displays enabled counts for built-in and custom animations. |
| Default Animations list | Lets the user enable or disable built-in animations in that category. |
| Custom Animations list | Lets the user enable or disable imported motions assigned to that category. |
| Last-enabled protection | The UI disables the toggle if turning it off would leave the category with no enabled animations. |

## Emotes sub-tab

Emotes combine audio, motion, and optional camera data into a reusable reaction asset.

### Emote creation and bulk import

| Control | Behavior |
| --- | --- |
| Emote Name | Required for manual emote creation. |
| Categories (comma separated) | Adds one or more custom category tags to the emote metadata. |
| Import ZIP Package | Bulk-imports multiple emotes from a ZIP archive. |
| Upload Audio | Selects the emote audio source. |
| Upload Motion | Selects the VMD motion file for the emote. |
| Upload Camera (Optional) | Adds optional VMD camera animation data. |
| Upload Emote | Starts manual emote creation and shows success or error feedback after the upload finishes. |

### Emote library controls

| Control | Behavior |
| --- | --- |
| Category filter dropdown | Filters the list to `all` emotes or a specific category. |
| Delete filtered button | Deletes every emote in the current filter scope. |
| Emote row rename | Inline name edit with save and cancel actions. |
| Emote delete | Removes the saved emote asset. |
| Emote visibility toggle | Shows or hides the emote from the emote panel without deleting it. |
| Emote category chevron | Opens auto-play category assignment toggles. |
| Auto-play Categories | Lets the emote participate in `general`, `idle`, `thinking`, `celebrating`, `walking`, or `talking` auto-play buckets. |

## Platform notes

- Desktop and Android use runtime-specific position overrides, so the same preset can look larger or more centered there than it does in the shared web view.
- Manual position selection is mainly meaningful outside native desktop and Android builds.
- Android wallpaper mode makes the 3D tab especially visible because the companion becomes the main visual layer instead of a secondary panel.