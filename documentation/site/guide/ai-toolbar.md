# AI Toolbar

The AI toolbar is the fastest way to work on the current page in VAssist. It is meant for selected text, active inputs, and hovered images when opening the full chat would be overkill.

<figure class="doc-figure">
	<img src="/assets/toolbars.png" alt="AI toolbar shown next to selected page text." />
	<figcaption>The toolbar appears close to the thing you are working on so you can rewrite, summarize, translate, inspect, or dictate without leaving the page.</figcaption>
</figure>

## When the toolbar appears

| Trigger | What appears |
| --- | --- |
| Text selection | Text tools such as rewrite, summarize, translate, dictionary actions, and send-to-chat actions. |
| Input focus | Input tools, especially dictation and writing actions for editable fields. |
| Image hover | Image analysis tools when image-hover support is enabled. |

The UI settings tab controls how often these triggers appear.

## Text selection behavior changes with selection length

- Single words lean toward dictionary tools such as definition, synonyms, antonyms, pronunciation, and examples.
- Short phrases can show both dictionary-style tools and summary options.
- Longer passages shift toward rewrite, summary, and translation tools.

That means the toolbar feels different on a single word than it does on a full paragraph, by design.

## Rewrite, summarize, translate, and write

<div class="doc-figure-grid">
	<figure class="doc-figure">
		<img src="/assets/rewrite.png" alt="Rewrite options in the AI toolbar." />
		<figcaption>Rewrite is for changing the existing text you selected.</figcaption>
	</figure>
	<figure class="doc-figure">
		<img src="/assets/summarize.png" alt="Summarize action in the AI toolbar." />
		<figcaption>Summarize is for compressing longer text into something shorter and easier to scan.</figcaption>
	</figure>
	<figure class="doc-figure">
		<img src="/assets/translate.png" alt="Translate action in the AI toolbar." />
		<figcaption>Translate detects the source language and lets you pick the output language.</figcaption>
	</figure>
	<figure class="doc-figure">
		<img src="/assets/writer.png" alt="Writer action in the AI toolbar." />
		<figcaption>Writer is for generating fresh text from a prompt instead of editing a selection.</figcaption>
	</figure>
</div>

### Rewrite actions

Rewrite covers more than one generic improvement button. The live toolbar supports actions such as grammar, spelling, professional tone, more formal, more casual, shorter, longer, simplify, concise, clarity, and a custom rewrite prompt.

Use rewrite when you already have text and want a better version of it.

### Summaries

The summarizer can produce different shapes of output, including shorter summary styles such as headline, key points, teaser, and other compact formats depending on the current toolbar choice.

Use summary when you want to reduce a longer passage without rewriting it line by line yourself.

### Translation

- Translation detects the source language for you.
- The output area lets you choose the target language.
- Once the translated result is visible, you can regenerate, copy it, or speak it.

### Writer

Writer is the toolbar tool for generating new text into an input instead of transforming a selection. Use it when you want a draft, reply, paragraph, or other new content from a short prompt.

## Dictionary and language tools

<div class="doc-figure-grid">
	<figure class="doc-figure">
		<img src="/assets/language_detector.png" alt="Language detection result in the AI toolbar." />
		<figcaption>Short selections can show language detection and dictionary-style actions instead of only long-form rewriting tools.</figcaption>
	</figure>
	<figure class="doc-figure">
		<img src="/assets/dictation.png" alt="Dictation controls in the AI toolbar." />
		<figcaption>When you focus an editable field, the toolbar can switch into a dictation-first mode.</figcaption>
	</figure>
</div>

- `Definition` explains the selected word.
- `Synonyms` and `Antonyms` help with alternative phrasing.
- `Pronunciation` focuses on how the word is said.
- `Examples` gives example usage.
- `Language Detection` helps when you need to identify the language before translating or rewriting.

## Dictation in editable fields

- If `Show on Input Focus` is on, clicking into an input or editable area can bring up the toolbar automatically.
- Dictation records speech and keeps track of the active insertion point.
- This is for editing when you want speech to go straight into the current field instead of into the main chat.

## Image actions

If `Show on Image Hover` is enabled, hovering an image can show image-specific tools:

- Describe image
- Extract text
- Identify objects

Use these when you want quick visual analysis without attaching the image into the full chat first.

## Review the output before inserting or copying it

The toolbar output area is where you review the result before you copy it, speak it, regenerate it, or move on.

| Output action | What it does |
| --- | --- |
| Regenerate | Runs the same action again for a different output. |
| Copy | Copies the current result. |
| Speak | Reads the result aloud when TTS is available and the tool supports it. |
| Target language picker | Appears for translation results so you can switch output language. |

## When to use the toolbar instead of full chat

- The toolbar fits best when the job starts from something already on the page.
- Full chat fits better when the request is multi-step, needs more context, or belongs in a saved conversation.

## Related guides

<div class="doc-link-list">
	<a href="/guide/chat-and-voice">Open chat and voice guide</a>
	<a href="/settings/ui">Open UI settings reference</a>
	<a href="/settings/ai-features">Open AI features reference</a>
</div>