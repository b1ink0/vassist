# AI Features Settings

Settings → AI+ controls the higher-level tools built on top of the active LLM. These are independent of provider selection. They just enable or disable extra capabilities.

Each feature has a toggle, a test action, and a result area. Disable any feature you don't use to keep the toolbar clean.

## Translator

The Translator powers the **Translate** action in the AI toolbar. When you select text on any page and open the toolbar, Translate sends it to the active LLM and returns a translation in your target language.

**To set up translation:**

1. Make sure **Translator** is toggled on.
2. Set **Default Translation Language** to your usual target language (e.g., `es` for Spanish, `ja` for Japanese).
3. Click **Test**. It translates `Hello, how are you?` into your selected language. If the result looks right, translation is working.
4. Select text anywhere on a page, open the AI toolbar, and use the Translate action.

If translation isn't appearing in the toolbar, check that the toggle is on here.

| Control                      | Default | Behavior                                                           |
| ---------------------------- | ------- | ------------------------------------------------------------------ |
| Translator                   | On      | Enable translation actions across the UI.                          |
| Default Translation Language | `en`    | Target language for the test and for default translation behavior. |
| Test                         | -       | Translates `Hello, how are you?` into the selected language.       |
| Clear                        | -       | Clears the last result.                                            |

## Language Detector

Language Detector identifies what language a text sample is written in. It runs before translation to detect the source language automatically, so translation doesn't need you to specify it manually.

**To enable and test:**

1. Toggle **Language Detector** on.
2. Click **Test**. It runs detection on the built-in French sample (`Bonjour, comment allez-vous?`) and shows the detected language and confidence score.
3. To test with your own text, edit the **Test Text** field before clicking Test.

Language Detector works silently in the background. You don't interact with it directly beyond enabling it.

| Control           | Default                        | Behavior                                                              |
| ----------------- | ------------------------------ | --------------------------------------------------------------------- |
| Language Detector | On                             | Enable language detection.                                            |
| Test Text         | `Bonjour, comment allez-vous?` | Sample used for the detection test.                                   |
| Test              | -                              | Detects language and shows the result with confidence when available. |
| Clear             | -                              | Clears the last result.                                               |

## Summarizer

The Summarizer powers the **Summarize** action in the AI toolbar. Select a block of text, open the toolbar, and Summarize generates a TL;DR-style condensed version.

**To enable and test:**

1. Toggle **Summarizer** on.
2. Click **Test**. It summarizes a built-in sample paragraph using the active LLM. If a condensed result appears, summarization is working.
3. Select a block of text on any page, open the AI toolbar, and use the Summarize action.

Summarizer uses TL;DR style, plain text output, medium length by default.

| Control    | Default | Behavior                                  |
| ---------- | ------- | ----------------------------------------- |
| Summarizer | On      | Enable summary generation.                |
| Test       | -       | Summarizes the built-in sample paragraph. |
| Clear      | -       | Clears the last result.                   |

Summarizer defaults: type `tldr`, format `plain-text`, length `medium`.

## Text Rewriter

Text Rewriter powers the **Rewrite** action in the AI toolbar. Select text, open the toolbar, and Rewrite rephrases it in a different tone or style while keeping the meaning.

**To enable and test:**

1. Toggle **Text Rewriter** on.
2. Click **Test**. It rewrites the built-in sample sentence in a more formal tone. If the result looks like a reworded version, rewriting is working.
3. Select text on any page, open the toolbar, and use the Rewrite action.

| Control       | Default | Behavior                                                     |
| ------------- | ------- | ------------------------------------------------------------ |
| Text Rewriter | On      | Enable rewrite actions for existing text.                    |
| Test          | -       | Rewrites the built-in sample sentence in a more formal tone. |
| Clear         | -       | Clears the last result.                                      |

## Content Writer

Content Writer powers the **Write** action in the AI toolbar. When you're focused on a text field, the toolbar can show a Write option. You provide a prompt and the LLM generates text and inserts it.

**To enable and test:**

1. Toggle **Content Writer** on.
2. Click **Test**. It generates a short paragraph about AI benefits from a built-in prompt. If a generated paragraph appears, content writing is working.
3. Click into any editable text field on a page, open the toolbar (Show on Input Focus must be on in UI settings), and use the Write action.

| Control        | Default | Behavior                                                                     |
| -------------- | ------- | ---------------------------------------------------------------------------- |
| Content Writer | On      | Enable prompt-to-content writing.                                            |
| Test           | -       | Generates a short paragraph about AI benefits from a built-in sample prompt. |
| Clear          | -       | Clears the last result.                                                      |

## Chrome AI feature flags

When Chrome AI is the active LLM provider and your Chrome version needs extra flags, a warning block appears with copy buttons for each required flag.

| Flag                                | Required for                    |
| ----------------------------------- | ------------------------------- |
| `translation-api`                   | Browser-side translation        |
| `language-detection-api`            | Browser-side language detection |
| `summarization-api-for-gemini-nano` | Browser-side summarization      |
| `rewriter-api`                      | Browser-side rewriting          |

::: tip
If toolbar actions like Translate, Summarize, or Rewrite aren't appearing or working, check this tab and verify the feature toggle is on.
:::
