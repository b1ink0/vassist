---
sidebar_position: 2
---

# Installation

Follow these steps to install and set up VAssist on your Chrome browser.

## Requirements

- **Chrome Browser** version 138 or newer
- **Chrome AI Features** enabled (see steps below)

:::tip
All processing happens on-device using Chrome's built-in AI. No API keys or subscriptions needed!
:::

## Step 1: Check Chrome Version

1. Open Chrome and type `chrome://version` in the address bar
2. Make sure you see version 138 or higher
3. If not, update Chrome from `chrome://settings/help`

## Step 2: Enable Chrome AI Flags

Visit each URL below and set to the specified value:

| Chrome Flag URL | Setting |
|-----------------|---------|
| `chrome://flags/#optimization-guide-on-device-model` | **Enabled BypassPerfRequirement** |
| `chrome://flags/#prompt-api-for-gemini-nano` | **Enabled** |
| `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` | **Enabled** |
| `chrome://flags/#writer-api-for-gemini-nano` | **Enabled** |
| `chrome://flags/#rewriter-api-for-gemini-nano` | **Enabled** |
| `chrome://flags/#summarization-api-for-gemini-nano` | **Enabled** |
| `chrome://flags/#translation-api` | **Enabled** |
| `chrome://flags/#language-detection-api` | **Enabled** |

:::warning Important
Click **Relaunch** button after enabling all flags to restart Chrome.
:::

## Step 3: Install Extension

1. Head to the [GitHub releases page](https://github.com/b1ink0/vassist/releases)
2. Download the latest `vassist-extension.zip` file
3. Extract the zip file to a permanent location on your computer
4. Open Chrome and go to `chrome://extensions`
5. Turn on **Developer mode** (toggle in top-right corner)
6. Click **Load unpacked**
7. Select the extracted `vassist-extension` folder
8. VAssist is now installed!

:::info
Keep the extracted folder in a permanent location. Don't delete it after installation, as Chrome needs it to run the extension.
:::

## Step 4: First Launch

When you click the VAssist extension icon for the first time, a setup wizard will guide you through:

1. **Welcome Screen** - Introduction to VAssist
2. **Position & Appearance** - Configure where companion appears and how it looks
3. **AI Model Download** - Automatic download of AI model (runs in background)

The setup wizard helps you configure everything perfectly. You can always change these settings later from the settings panel.

## Troubleshooting

### AI Features Not Working

If AI features aren't working:
- Verify all Chrome flags are enabled (Step 2)
- Make sure you clicked Relaunch after enabling flags
- Check Chrome version is 138 or newer
- Wait for AI model download to complete (may take a few minutes on first launch)

### Extension Not Loading

If the extension doesn't load:
- Make sure Developer mode is enabled in `chrome://extensions`
- Check that you selected the correct folder (should contain `manifest.json`)
- Try removing and re-adding the extension
- Check for error messages in `chrome://extensions`

## Next Steps

Now that VAssist is installed, learn how to use it:

- [AI Toolbar Features](./features/toolbar.md) - Text selection tools
- [Chat Interface](./features/chat.md) - Conversations with AI
- [Virtual Companion](./features/companion.md) - Customize your companion

## Need Help?

- [GitHub Issues](https://github.com/b1ink0/vassist/issues) - Report bugs
- [GitHub Discussions](https://github.com/b1ink0/vassist/discussions) - Ask questions
