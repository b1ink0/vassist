# VAssist - Your AI-Powered Virtual Assistant

VAssist brings an interactive 3D character to your browser, powered by Chrome's built-in AI. Think of it as having a personal assistant that lives right in your browser, ready to help with writing, translations, summaries, and more.

## Quick Links

[🎮 Try Demo](https://vassist-demo.vercel.app) • [⚡ AI Toolbar Features](#ai-toolbar---the-star-feature) • [🚀 Installation](#getting-started) • [⚙️ Customization](#customization) • [💻 Contributing](CONTRIBUTING.md)

---

## Try Before Installing

Want to see what VAssist can do before installing? Check out our [demo site](https://vassist-demo.vercel.app) and play around with all the features. No installation needed, just open it in Chrome and start chatting.

---

## What VAssist Does

### AI Toolbar - The Star Feature

Select any text on any website and watch the magic happen. A sleek toolbar pops up with powerful AI tools at your fingertips:

#### 📝 Summarize
Turn walls of text into digestible chunks. Uses **Chrome's Summarizer API** to give you:
- **Headline** - One punchy line
- **Key Points** - Bullet list of main ideas  
- **Teaser** - Short preview that hooks you in

#### 🌍 Translate
Speak the language, any language. Powered by **Chrome's Translator API**:
- Translate to 100+ languages instantly
- **Auto-detect** what language you're reading
- Works completely offline

#### ✍️ Rewrite  
Make your words shine. **Chrome's Rewriter API** helps you:
- **Fix Spelling & Grammar** - Clean up mistakes
- **Change Tone** - Go formal, casual, or professional
- **Adjust Length** - Make it shorter, expand it, or keep it concise
- **Improve Clarity** - Simplify complex sentences
- **Custom Rewrites** - Tell it exactly what you want

#### 📚 Dictionary
Your personal word expert. Uses **Chrome's Prompt API** (Gemini Nano):
- Get definitions on the spot
- Find synonyms and antonyms
- Learn pronunciation
- See real usage examples

#### 🎨 Writer
Generate fresh content from scratch. Powered by **Chrome's Writer API**:
- Create content based on your ideas
- Works with your selected text as context
- Perfect for brainstorming and drafting

#### 🖼️ Image Tools
Just hover over any image to:
- **Describe** - AI tells you what's in the image (**Multimodal Prompt API**)
- **Extract Text** - Pull out text from screenshots (OCR)
- **Identify Objects** - Spot and label things in photos

#### 🎤 Voice Dictation
Talk instead of type. **Multimodal Input API** lets you dictate directly into text fields.

#### 📄 Document Interaction
Work smarter with web content:
- **Page Context** - Ask questions about the current page you're viewing
- **Smart Summaries** - Get instant summaries of articles and documents
- **Content Analysis** - Understand complex content with AI assistance
- Works seamlessly with Chrome's built-in AI

---

### Chat With Your Assistant

Open the chat window anytime to have natural conversations with Gemini Nano running right in your browser.

### Your 3D Companion

A fully animated 3D character appears on your screen, making the experience more interactive and fun. The character responds with expressions and gestures, bringing some personality to your browsing.

---

## Getting Started

### What You'll Need

VAssist is built specifically for **Google Chrome** with built-in AI capabilities. Here's what you need:

- **Chrome Browser** version 138 or newer
- **Chrome AI Features** enabled (we'll walk you through this)
- That's it! No API keys, no subscriptions, no external services needed

> **Note:** While other providers like OpenAI can be used as fallbacks, VAssist is designed for Chrome's built-in AI to give you the best experience.

### Enable Chrome AI Features

Chrome's AI features need to be turned on first. Don't worry, it's straightforward:

**Step 1: Check Your Chrome Version**
1. Open Chrome and type `chrome://version` in the address bar
2. Make sure you see version 138 or higher
3. If not, update Chrome from `chrome://settings/help`

**Step 2: Enable Required Flags**

Copy and paste these URLs into Chrome, then change each to the specified setting:

| Chrome Flag URL | Setting |
|-----------------|---------|
| `chrome://flags/#optimization-guide-on-device-model` | **Enabled BypassPerfRequirement** |
| `chrome://flags/#prompt-api-for-gemini-nano` | **Enabled** |
| `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` | **Enabled** |
| `chrome://flags/#writer-api-for-gemini-nano` | **Enabled** |
| `chrome://flags/#rewriter-api-for-gemini-nano` | **Enabled** |

Once you've enabled all five flags, hit the **Relaunch** button at the bottom of the page to restart Chrome.

### Install VAssist Extension

**From Release (Recommended)**
1. Head to the [latest release page](https://github.com/b1ink0/vassist/releases/latest)
2. Download the `vassist-extension.zip` file
3. Extract the zip file somewhere on your computer
4. Open Chrome and go to `chrome://extensions`
5. Turn on **Developer mode** (toggle in top-right corner)
6. Click **Load unpacked**
7. Select the extracted `vassist-extension` folder
8. VAssist is now installed!

### First Time Setup

When you first click the VAssist icon, the application will walk you through a quick setup to get everything configured just the way you like.

---

## Privacy & Offline Use

VAssist runs locally using Chrome's built-in AI. Your conversations and data stay on your device. No information is sent to external servers unless you explicitly choose to use alternative AI providers in settings.

The AI model downloads once and works offline after that (though you still need internet for browsing websites).

---

## Customization

### Settings Panel

Access settings from the chat interface to customize:

**Appearance**
- Position (corners, center, custom)
- Size and scale
- Transparency and blur effects
- Theme options

**Behavior**
- Animation speed and style
- Auto-hide when inactive
- Chat history length
- Voice settings

**AI Provider**
- Use Chrome AI (recommended)
- Fallback options for unsupported features

---

## Built With

VAssist is built using modern web technologies:

- **React** - UI framework
- **Vite** - Build tool and dev server
- **Babylon.js** - 3D rendering engine
- **Tailwind CSS** - Styling
- **Chrome AI APIs** - Built-in AI capabilities (Gemini Nano)

---

## Contributing

Want to contribute? Check out the [Contributing Guide](CONTRIBUTING.md) for development setup and guidelines.

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## Support & Community

- **Issues**: Found a bug? [Report it here](https://github.com/b1ink0/vassist/issues)
- **Discussions**: Questions or ideas? [Start a discussion](https://github.com/b1ink0/vassist/discussions)
- **Updates**: Follow the project to get notified about new features

---

Made with curiosity and a bit of magic ✨
