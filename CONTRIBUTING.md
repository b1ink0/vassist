# Contributing to VAssist

Thanks for your interest in contributing! This guide covers everything you need to know about the project's architecture, development setup, and how to make changes.

---

## Development Setup

### Prerequisites

- Node.js 18+ or Bun 1.0+ (Bun is faster)
- Chrome 138+ for testing
- Git

### Getting Started

Clone the repo, install dependencies, and you're ready to go:
- Use `bun install` or `npm install` for dependencies
- Run `bun run dev` for demo mode development
- Run `bun run build:extension` to build the extension
- Run `bun run build:all` to build both

### Available Commands

**Development:**
- `bun run dev` - Demo mode dev server (http://localhost:5173)
- `bun run dev:extension` - Build extension in watch mode
- `bun run dev:all` - Run both simultaneously

**Production:**
- `bun run build` - Build demo for production
- `bun run build:extension` - Build extension for production
- `bun run build:all` - Build both

**Utilities:**
- `bun run lint` - Run ESLint
- `bun run preview` - Preview production build

---

## Architecture Overview

### Two Modes, Same Code

VAssist runs in two modes that share 95% of the same code:

**Demo Mode** (Standalone Web App)
- Lives at the demo URL
- Direct API calls to services
- Hot reload for fast development
- Perfect for testing features quickly

**Extension Mode** (Chrome Extension)
- Injects into any website
- Message passing between contexts
- Shadow DOM for isolation
- Multi-tab support with per-tab state

### How Code Sharing Works

**Shared Components (95%):**
- `src/components/` - All React UI
- `src/babylon/` - All 3D rendering
- `src/config/` - All configuration
- `src/utils/` - Most utilities

**Mode-Specific (5%):**
- `src/services/` - Demo mode: direct calls
- `extension/` - Extension mode: message passing

**Smart Proxies** automatically route calls between demo and extension modes.

### Extension Architecture

VAssist uses a multi-layer architecture:
1. Main World (React App)
2. Content Script (Isolated World) 
3. Background Service Worker
4. External APIs

### Shadow DOM Isolation

VAssist uses Shadow DOM for zero CSS conflicts with host pages:
- Canvas for 3D character is outside (Babylon.js WebGL needs direct browser access)
- All UI lives inside closed shadow-root with scoped Tailwind styles
- Tested on YouTube, Twitter, Gmail, GitHub - works everywhere

---

## Project Structure

The project is organized into shared source code and extension-specific files:

**Main Source (`src/`):**
- `components/` - React components, settings panels, setup wizard
- `babylon/` - 3D rendering (MMDModelScene, AnimationManager)
- `services/` - Services with smart routing proxies
- `managers/` - State management (ChatManager, StorageManager)
- `config/` - Configuration files (AI, animations, UI)
- `workers/` - Web workers (AudioWorkerClient)

**Extension (`extension/`):**
- `manifest.json` - Extension configuration
- `background/` - Service worker and per-tab services
- `content/` - Content script injection
- `offscreen/` - Audio processing

**Static Assets (`public/`):**
- `res/assets/model/` - 3D models (.bpmx format)
- `res/assets/motion/` - Animations (.bvmd format)

---

## How to Add Features

### Adding a New AI Provider

1. Create a service class in `src/services/` for demo mode
2. Create a background service in `extension/background/services/` for extension mode
3. Add a proxy in `src/services/proxies/` to route between modes
4. Register the provider in `src/config/aiConfig.js`

### Adding UI Components

Components in `src/components/` automatically work in both demo and extension modes. Just create your component and import it where needed.

### Adding Settings

1. Add default value to `src/config/uiConfig.js`
2. Create a settings panel component in `src/components/settings/`
3. Use the useConfig hook to read and update the setting

---

## Testing

### Manual Testing Checklist

Before submitting a PR, test in both modes:

**Demo Mode:**
- [ ] `bun run dev` starts without errors
- [ ] Feature works as expected
- [ ] No console errors
- [ ] Performance is acceptable

**Extension Mode:**
- [ ] `bun run build:extension` completes
- [ ] Extension loads in Chrome
- [ ] Feature works on multiple websites
- [ ] No conflicts with host pages
- [ ] Multi-tab behavior is correct

**Cross-browser:**
- [ ] Test in Chrome stable
- [ ] Test in Chrome Canary (for new APIs)

### Debugging

**Demo Mode:**
- Open DevTools (F12) and check Console
- Use React DevTools for component debugging
- Monitor Network tab for API calls

**Extension Mode:**
- **Content Script:** F12 on webpage, look for `[Content]` logs
- **Background Worker:** Right-click extension icon → "Inspect service worker", look for `[Background]` logs
- **Offscreen Document:** Check background console for `[Offscreen]` logs

Enable debug panel in Settings → UI to see FPS, memory, and animation state.

---

## Pull Request Process

1. Fork the repo and create a feature branch
2. Make your changes following code style guidelines
3. Test thoroughly in both demo and extension modes
4. Commit with clear, descriptive messages
5. Push and create a pull request
6. Describe what changed, why it's needed, and how you tested it

---

## Resources

### External Resources

- [React Docs](https://react.dev)
- [Babylon.js Docs](https://doc.babylonjs.com)
- [Chrome Extension Docs](https://developer.chrome.com/docs/extensions)
- [Chrome AI APIs](https://developer.chrome.com/docs/ai/built-in)

---

## Questions?

- Open a [Discussion](https://github.com/b1ink0/vassist/discussions) for questions
- Open an [Issue](https://github.com/b1ink0/vassist/issues) for bugs

Thanks for contributing! 🎉
