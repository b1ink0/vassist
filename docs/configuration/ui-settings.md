---
sidebar_position: 2
---

# UI Settings

Customize the appearance and behavior of VAssist's virtual companion and interface.

## Companion Settings

### Enable Model Loading

Toggle the virtual companion on or off completely.

- **Enabled** - Companion appears on pages
- **Disabled** - Companion hidden, only chat interface available

Useful when you want chat functionality without the animated character.

### Portrait Mode

Choose how much of the companion to display.

- **Disabled** - Full body mode (shows entire character)
- **Enabled** - Portrait mode (shows upper body only)

### FPS Limit

Control rendering frame rate for performance optimization.

Options:
- **30 FPS** - Battery saver, lower performance
- **60 FPS** - Balanced (recommended)
- **90 FPS** - Smooth animations
- **Native** - Matches monitor refresh rate (highest performance)

Lower FPS saves battery and resources on slower devices.

## Positioning

### Position Presets

Choose where the companion appears on your screen:

- **Bottom Right** - Default chatbot position
- **Bottom Left** - Mirror of bottom right
- **Bottom Center** - Centered at bottom
- **Top Right** - Upper right corner
- **Top Left** - Upper left corner
- **Top Center** - Centered at top
- **Center** - Large centered view
- **Last Location** - Remembers where you dragged it

Each preset automatically adjusts for full body and portrait modes.

### Drag and Drop

You can always click and drag the companion to any position. Use the "Last Location" preset to save and restore custom positions.

## Auto-Load Settings

### Auto-Load on All Pages

Control whether companion loads automatically when visiting websites.

- **Enabled** - Companion loads on every page
- **Disabled** - Companion only loads when you click the extension icon

## AI Toolbar Settings

### Enable AI Toolbar

Toggle the entire toolbar feature on/off.

### Show on Input Focus

Show toolbar when clicking into text input fields.

- Provides quick access to dictation and writing tools
- Disable if you find it distracting

### Show on Image Hover

Show image analysis tools when hovering over images.

- Enables describe, OCR, object identification
- Disable to prevent toolbar from appearing on images

## Visual Settings

### Colored Icons

Choose icon color scheme throughout VAssist.

- **Disabled** - Monochrome icons
- **Enabled** - Colored icons throughout interface
- **Toolbar Only** - Colored icons only in AI toolbar

Colored icons make features more distinguishable but may not match all website themes.

### Background Detection

Automatically adjust chat theme based on page background.

Modes:
- **Adaptive** - Auto-detect background brightness
- **Light** - Force light theme (dark chat on light background)
- **Dark** - Force dark theme (light chat on dark background)

Sample Grid Size: Controls how many points are sampled to detect background (1-10) more points will provide more accurate detection but may impact performance.

## Keyboard Shortcuts

### Enable Shortcuts

Master toggle for all keyboard shortcuts.

### Configure Shortcuts

- **Toggle Chat** - Open/close chat interface
- **Toggle Companion** - Show/hide virtual companion

Click the input field and press your desired key combination. Supports:
- Ctrl, Alt, Shift, Meta (Cmd on Mac)
- Any letter or number key
- Combinations like Ctrl+Shift+C

[Learn more about Shortcuts →](./shortcuts.md)

## Developer tools

### Enable Developer Tools

Show technical debug information overlay.

- FPS counter
- Rendering statistics
- Performance metrics

Only enable when troubleshooting issues or during development.

## Next Steps

- [LLM Settings](./llm-settings.md) - Configure AI providers
- [Keyboard Shortcuts](./shortcuts.md) - Detailed shortcut configuration
