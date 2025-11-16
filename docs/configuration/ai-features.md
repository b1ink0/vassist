---
sidebar_position: 6
---

# AI+

Toggle individual AI capabilities that enhance the toolbar and chat experience. These features work with **all LLM providers** (Chrome AI, OpenAI, Ollama).

## Overview

AI Features are advanced capabilities powered by your configured LLM provider:

- **Translator** - Translate text between 25+ languages
- **Language Detector** - Detect language with confidence scores
- **Summarizer** - Generate different types of summaries
- **Text Rewriter** - Rewrite text in different tones/styles
- **Content Writer** - Generate new content from prompts

All features can be individually enabled or disabled based on your needs.

## Translator

**Default**: Enabled

Translate text between multiple languages in the AI Toolbar and Chat.

### Features

- **Auto-Detection** - Automatically detects source language
- **Bidirectional** - Translate from any language to any language

### Default Translation Language

Set your preferred target language for translations. This is used when:

- Using "Translate" in AI Toolbar on selected text
- Testing the translator in settings

**Default**: English (en)

Can be changed to any of the supported languages.

### Where It's Used

- **AI Toolbar** - "Translate" action on text selection

### Testing

Click **Test** to translate "Hello, how are you?" to your selected target language.

## Language Detector

**Default**: Enabled

Automatically detect the language of text with confidence scores.

### Features

- **Auto-Detection** - Identifies language from text samples
- **Confidence Scores** - Shows probability for each detected language
- **Multi-Language** - Supports all major world languages

### Where It's Used

- **AI Toolbar** - Automatically detects language before translation

### Testing

Enter any text in the test input field and click **Test** to detect its language.

Results show: Language name and confidence percentage.

## Summarizer

**Default**: Enabled

Generate different types of summaries from long text.

### Summary Types

When using the summarizer from AI Toolbar, you can choose:

#### TL;DR (Too Long; Didn't Read)
- Short, concise summary
- Captures main points only
- Best for quick overview

#### Key Points
- Bullet-point summary
- Highlights main ideas
- Easy to scan format

#### Teaser
- Engaging preview summary
- Sparks curiosity
- Good for content preview

#### Headline
- Single-sentence summary
- Captures essence in few words
- News-style format

### Summary Formats

- **Plain Text** - Simple text format
- **Markdown** - Formatted with markdown

### Summary Lengths

- **Short** - Brief, essential points only
- **Medium** - Balanced detail (default)
- **Long** - Comprehensive summary

### Where It's Used

- **AI Toolbar** - "Summarize" action on text selection

### Testing

Click **Test** to summarize a sample paragraph about AI.

## Text Rewriter

**Default**: Enabled

Rewrite text in different tones and styles while preserving meaning.

### Rewrite Actions

The rewriter supports using AI Toolbar:
- **Fix Grammar** - Correct grammatical errors
- **Fix Spelling** - Correct spelling mistakes
- **Improve Clarity** - Make text clearer
- **Simplify** - Use simpler words
- **Make Concise** - Remove unnecessary words
- And more...

### Where It's Used

- **AI Toolbar** - "Rewrite" action on text selection

### Testing

Click **Test** to rewrite "The weather is nice today." in a more formal tone.

## Content Writer

**Default**: Enabled

Generate new content from prompts with different tones and lengths.

### Where It's Used

- **AI Toolbar** - "Writer" action in input fields

### Testing

Click **Test** to write a short paragraph about AI benefits in neutral tone.

## Chrome AI Additional Flags

### Required Flags

Enable these flags at `chrome://flags`:

1. **translation-api**
   - Enables translation feature

2. **language-detection-api**
   - Enables language detection

3. **summarization-api-for-gemini-nano**
   - Enables summarization

4. **rewriter-api-for-gemini-nano**
   - Enables text rewriting

5. **writer-api-for-gemini-nano**
   - Enables content generation

### Setup Instructions

1. Click "Copy Flag URL" for each flag
2. Paste each URL in Chrome address bar
3. Set each flag to **"Enabled"**
4. Click **"Relaunch"** at bottom of flags page
5. After restart, AI Features will be available

## Troubleshooting

### Feature Not Appearing in Toolbar

- Check feature is **enabled** in settings
- Verify LLM provider is configured correctly
- For Chrome AI: Check flags are enabled
- Refresh the page after enabling

## Next Steps

- [Shortcuts](./shortcuts.md) - Configure keyboard shortcuts
- [LLM Settings](./llm-settings.md) - Configure AI provider
- [UI Settings](./ui-settings.md) - Customize interface
