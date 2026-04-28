/**
 * Centralized Prompt Configuration
 * All AI prompts used throughout the application
 */

export const PromptConfig = {
  systemPrompts: {
    default: {
      name: 'Default',
      prompt: 'You are a helpful virtual assistant. Be concise and friendly.',
    },
    professional: {
      name: 'Professional',
      prompt: 'You are a professional virtual assistant. Provide accurate, well-structured responses with a formal tone. Be clear, concise, and maintain professionalism in all interactions.',
    },
    friendly: {
      name: 'Friendly',
      prompt: 'You are a friendly and casual virtual assistant. Be warm, approachable, and conversational. Use simple language and maintain a positive, helpful attitude.',
    },
    technical: {
      name: 'Technical Expert',
      prompt: 'You are a technical expert assistant. Provide detailed, accurate technical information. Use precise terminology and explain complex concepts clearly. Include code examples and best practices when relevant.',
    },
    creative: {
      name: 'Creative',
      prompt: 'You are a creative assistant. Help with brainstorming, creative writing, and artistic endeavors. Be imaginative, expressive, and encourage creative thinking.',
    },
    concise: {
      name: 'Concise',
      prompt: 'You are a concise virtual assistant. Provide brief, to-the-point responses. Eliminate unnecessary information and focus on essential details only.',
    },
    teacher: {
      name: 'Teacher',
      prompt: 'You are an educational assistant. Explain concepts clearly with examples and analogies. Break down complex topics into understandable parts. Encourage learning and understanding.',
    },
    custom: {
      name: 'Custom',
      prompt: '',
    },
  },

  dictionary: {
    define: (word: string) => `Provide a concise dictionary definition for the word: "${word}"

Include:
1. Part of speech (noun, verb, adjective, etc.)
2. 2-3 key meanings or definitions
3. Keep it brief and clear
4. Use PLAIN TEXT only - no markdown formatting, no bold, no asterisks

Format as plain text:
${word} (part of speech)

1. Definition one
2. Definition two
3. Definition three (if applicable)`,

    synonyms: (word: string) => `List 8-10 synonyms for the word: "${word}"

Requirements:
- Organize by common usage (most relevant first)
- Include only words with similar meaning
- Use PLAIN TEXT only - no markdown, no bold, no asterisks
- Format as a simple list

Format as plain text:
Synonyms for "${word}":
• synonym1
• synonym2
• synonym3
...`,

    antonyms: (word: string) => `List antonyms (opposite words) for: "${word}"

Requirements:
- Provide 5-8 relevant antonyms
- Only include words with opposite meaning
- Use PLAIN TEXT only - no markdown, no bold, no asterisks
- Format as a simple list

Format as plain text:
Antonyms for "${word}":
• antonym1
• antonym2
• antonym3
...`,

    pronunciation: (word: string) => `Provide pronunciation guide for the word: "${word}"

Include:
1. IPA (International Phonetic Alphabet) notation
2. Simple phonetic spelling that anyone can read
3. Syllable breakdown if applicable
4. Use PLAIN TEXT only - no markdown, no bold, no asterisks

Format as plain text:
Pronunciation for "${word}":

IPA: /aɪ piː eɪ notation/
Phonetic: (simple-pronunciation)
Syllables: word-break-down

Example:
Pronunciation for "pronunciation":
IPA: /prəˌnʌnsiˈeɪʃən/
Phonetic: (pruh-nun-see-AY-shun)
Syllables: pro-nun-ci-a-tion`,

    examples: (word: string) => `Provide 4-5 example sentences using the word: "${word}"

Requirements:
- Show diverse contexts and common usage patterns
- Make sentences natural and realistic
- Highlight different meanings if applicable
- Keep sentences concise
- Use PLAIN TEXT only - no markdown, no bold, no asterisks

Format as plain text:
Usage Examples for "${word}":

1. Example sentence one.
2. Example sentence two.
3. Example sentence three.
4. Example sentence four.
5. Example sentence five.`,
  },

  // Rewriter Prompts (Chrome AI Rewriter API compatible)
  // Supports tone: 'as-is', 'more-formal', 'more-casual'
  // Supports format: 'as-is', 'plain-text', 'markdown'
  // Supports length: 'as-is', 'shorter', 'longer'
  rewriter: {
    // More formal tone
    moreFormal: (text: string) => `Rewrite the following text in a more formal, professional tone. Return ONLY the rewritten text with no explanations:

${text}`,

    // More casual tone
    moreCasual: (text: string) => `Rewrite the following text in a more casual, conversational tone. Return ONLY the rewritten text with no explanations:

${text}`,

    // Make shorter
    shorter: (text: string) => `Rewrite the following text to be shorter while preserving key information. Return ONLY the rewritten text with no explanations:

${text}`,

    // Make longer
    longer: (text: string) => `Rewrite the following text to be longer with more detail and elaboration. Return ONLY the rewritten text with no explanations:

${text}`,

    // Plain text format
    plainText: (text: string) => `Rewrite the following text using plain text only, no markdown. Return ONLY the rewritten text with no explanations:

${text}`,

    // Markdown format
    markdown: (text: string) => `Rewrite the following text using markdown formatting. Return ONLY the rewritten text with no explanations:

${text}`,

    // Fix grammar (useful rewrite action)
    grammar: (text: string) => `Rewrite the following text to fix grammar errors. Return ONLY the corrected text with no explanations:

${text}`,

    // Fix spelling (useful rewrite action)
    spelling: (text: string) => `Rewrite the following text to fix spelling errors. Return ONLY the corrected text with no explanations:

${text}`,

    // Improve clarity
    clarity: (text: string) => `Rewrite the following text to improve clarity. Return ONLY the improved text with no explanations:

${text}`,

    // Professional tone
    professional: (text: string) => `Rewrite the following text in a professional, business-appropriate tone. Return ONLY the rewritten text with no explanations:

${text}`,

    // Formal style
    formal: (text: string) => `Rewrite the following text in a formal, academic style. Return ONLY the rewritten text with no explanations:

${text}`,

    // Simplify
    simplify: (text: string) => `Rewrite the following text to be simpler and easier to understand. Use simpler words and shorter sentences. Return ONLY the simplified text with no explanations:

${text}`,

    // Expand
    expand: (text: string) => `Rewrite the following text to be more detailed and comprehensive. Return ONLY the expanded text with no explanations:

${text}`,

    // Make concise
    concise: (text: string) => `Rewrite the following text to be more concise while preserving meaning. Return ONLY the concise version with no explanations:

${text}`,
  },

  writer: {
    write: (prompt: string) => `${prompt}`,

    formal: (prompt: string) => `Write in a formal, professional tone:\n\n${prompt}`,

    neutral: (prompt: string) => `Write in a neutral, balanced tone:\n\n${prompt}`,

    casual: (prompt: string) => `Write in a casual, conversational tone:\n\n${prompt}`,

    short: (prompt: string) => `Write a brief, concise response (1-2 paragraphs):\n\n${prompt}`,

    medium: (prompt: string) => `Write a moderate length response (2-3 paragraphs):\n\n${prompt}`,

    long: (prompt: string) => `Write a detailed, comprehensive response (4+ paragraphs):\n\n${prompt}`,

    plainText: (prompt: string) => `Write using plain text only, no markdown:\n\n${prompt}`,

    markdown: (prompt: string) => `Write using markdown formatting:\n\n${prompt}`,
  },

  image: {
    describe: (imageCount: number) => 
      imageCount === 1
        ? 'Describe this image in detail.'
        : `Describe these ${imageCount} images in detail.`,

    extractText: (imageCount: number) =>
      imageCount === 1
        ? 'Extract and return all text visible in this image. Format it clearly and preserve the structure.'
        : `Extract and return all text visible in these ${imageCount} images. Format it clearly and preserve the structure for each image.`,

    identifyObjects: (imageCount: number) =>
      imageCount === 1
        ? 'Identify and list all objects visible in this image.'
        : `Identify and list all objects visible in these ${imageCount} images.`,
  },

  audio: {
    transcribe: 'Transcribe this audio accurately. Return only the transcription.',
    
    summarize: 'Listen to this audio and provide a concise summary of its content.',
    
    translate: (targetLanguage: string) => 
      `Transcribe this audio and translate it to ${targetLanguage}. Provide both the original transcription and the translation.`,
  },

  documentInteraction: {
    analyzerSystemPrompt: `You are an intelligent webpage context analyzer. Analyze user queries to determine what information from the current webpage is needed to answer them accurately.

CRITICAL RULES:
1. Respond with ONLY a valid JSON object - no markdown, no code blocks, no explanation
2. Use double quotes for all strings
3. Escape special characters properly

JSON Structure:
{
  "needsContext": boolean,
  "contextType": "text" | "links" | "forms" | "images" | "tables" | "code" | "all" | "none",
  "selector": "valid CSS selector or empty string",
  "reason": "brief explanation"
}

Context Types & When to Use:
- "text": Page content (articles, descriptions, paragraphs) - use selectors like "main, article, .content, body"
- "links": URLs and navigation - use "a[href]"
- "forms": Input fields, forms, buttons - use "form, input, button, select, textarea"
- "images": Image information - use "img[src], picture, figure"
- "tables": Tabular/structured data displayed in tables - use selector "table" (finds ALL tables automatically)
- "code": Code blocks and snippets - use "pre, code, .code-block"
- "all": Multiple types needed - comprehensive extraction
- "none": No page context needed (general knowledge, personal questions)

KEY INSIGHT FOR TABLES:
When the user asks about ANY structured/tabular data visible on the page, use contextType "tables" with selector "table". The system automatically finds all tables. Be smart about recognizing when data is likely in a table format.

Examples:

User: "What is this page about?"
{"needsContext":true,"contextType":"text","selector":"main, article, [role=main], .content, body","reason":"Need page content"}

User: "Summarize this article"
{"needsContext":true,"contextType":"text","selector":"article, main, .post, .article-content, body","reason":"Need article text"}

User: "What links are on this page?"
{"needsContext":true,"contextType":"links","selector":"a[href]","reason":"User wants links"}

User: "List the navigation items"
{"needsContext":true,"contextType":"links","selector":"nav a, header a, .navigation a, .menu a","reason":"Navigation links needed"}

User: "What images are shown?"
{"needsContext":true,"contextType":"images","selector":"img[src], picture, figure","reason":"Image information needed"}

User: "What can I fill out here?"
{"needsContext":true,"contextType":"forms","selector":"form, input, textarea, select, button","reason":"Form elements needed"}

User: "Show me the data table"
{"needsContext":true,"contextType":"tables","selector":"table","reason":"Table data needed"}

User: "Extract the weather forecast table data and summarize the weekly pattern"
{"needsContext":true,"contextType":"tables","selector":"table","reason":"Need table data"}

User: "Analyze the table"
{"needsContext":true,"contextType":"tables","selector":"table","reason":"Table analysis needed"}

User: "What's in the table?"
{"needsContext":true,"contextType":"tables","selector":"table","reason":"Table content needed"}

User: "What code is on this page?"
{"needsContext":true,"contextType":"code","selector":"pre code, .code-block, .highlight, pre","reason":"Code snippets needed"}

User: "What's the page title?"
{"needsContext":true,"contextType":"text","selector":"h1, title, .page-title, .title, .heading","reason":"Page title needed"}

User: "What time is it?"
{"needsContext":false,"contextType":"none","selector":"","reason":"General question"}

User: "Tell me about yourself"
{"needsContext":false,"contextType":"none","selector":"","reason":"Personal question"}

Remember: Output ONLY the JSON object.`,

    analyzeQuery: (userQuery: string) => `Analyze this user query and determine what webpage context is needed. Respond with ONLY valid JSON (no markdown, no explanation):

Query: "${userQuery}"

JSON:`,
  },

  routing: {
    routerSystemPrompt: `You are an intelligent routing assistant for a multi-model AI system. Analyze user queries to decide if vision analysis is needed.

CRITICAL RULES:
1. Respond with ONLY a valid JSON object - no markdown, no code blocks, no explanation
2. Use double quotes for all strings
3. Escape special characters properly (\\n for newlines, \\" for quotes)

Your task: Determine if vision is needed, and if so, generate a SPECIFIC, FOCUSED prompt for vision analysis.

JSON Structure:
{
  "needsVision": true | false,
  "visionPrompt": "specific question for vision model (only if needsVision=true)",
  "focus": "main_subject" | "text_extraction" | "error_detection" | "ui_analysis" | "code_review" | "general_description",
  "reason": "brief explanation why vision is/isn't needed"
}

INTELLIGENT VISION DETECTION - Set needsVision=true when:

1. EXPLICIT visual references:
   - User mentions: "screen", "camera", "image", "picture", "video", "see", "look", "show", "display"
   - UI elements: "button", "menu", "window", "dialog", "popup", "notification"
   - Visual problems: "error", "bug", "issue", "broken", "wrong", "missing"

2. IMPLICIT visual questions (BE SMART - these need vision even without explicit keywords):
   - "what are you seeing" / "what do you see" / "what is visible"
   - "what's happening" / "what's going on" / "what's this about"
   - "what am I looking at" / "what is this" / "what does it say"
   - "can you read this" / "tell me what this shows"
   - "describe this" / "explain this" (referring to current context)
   - "what's wrong" / "why isn't this working" (likely debugging visual issue)
   - "how does this look" / "does this look right"

3. CONTEXTUAL follow-ups (if recent messages used vision):
   - "what about now" / "and now" / "how about this"
   - "that one" / "it" / "this" (pronouns referring to visual content)
   - Follow-up questions about previously analyzed visual content
   - "fix it" / "change that" / "update this" (referring to visual elements)

4. DEBUGGING & analysis requests:
   - Any request to analyze, debug, review, check, or examine (likely needs visual context)
   - Questions about "why" something isn't working (visual inspection helps)
   - Requests for help with code, UI, or technical issues

Set needsVision=false ONLY for:
- Pure greetings: "hello", "hi", "how are you"
- Factual questions with NO current context: "what is X", "how does Y work" (general knowledge)
- Text-based tasks: "write code for", "explain the concept of", "calculate"
- Conversation meta-questions: "what did I ask before", "what were we talking about"
- Questions explicitly about past conversation (not current visual state)

IMPORTANT: When generating visionPrompt, be SPECIFIC and tell the vision model:
- EXACTLY what to look for
- To ONLY report what is actually visible
- To NOT make assumptions or guesses
- To NOT hallucinate or invent information
- To be concise and fact-based

Focus Types (when needsVision=true):
- "main_subject": Identify primary objects/subjects in image
- "text_extraction": Extract all visible text accurately
- "error_detection": Look for errors, warnings, or issues
- "ui_analysis": Analyze UI elements, layout, components
- "code_review": Analyze code visible in image
- "general_description": Comprehensive description of everything

Examples:

User: "What's on my screen?"
{"needsVision":true,"visionPrompt":"Describe what you see on this screen. Focus on: main application, current activity, any visible text or UI elements, and any errors or notifications.","focus":"general_description","reason":"User asking about current screen content"}

User: "What error am I getting?"
{"needsVision":true,"visionPrompt":"Look carefully for any error messages, warnings, or error indicators in this image. Extract the exact error text and note where it appears.","focus":"error_detection","reason":"User asking about visual error"}

User: "Read this text"
{"needsVision":true,"visionPrompt":"Extract ALL visible text from this image. Preserve formatting, line breaks, and structure. Return the complete text content.","focus":"text_extraction","reason":"User wants text extracted from visual"}

User: "Analyze this code"
{"needsVision":true,"visionPrompt":"Examine the code visible in this image. Identify: programming language, code structure, any syntax errors or issues, and the apparent purpose of the code.","focus":"code_review","reason":"User wants code analysis"}

User: "How do I center a div in CSS?"
{"needsVision":false,"visionPrompt":"","focus":"","reason":"General coding question, no visual reference needed"}

User: "What's the weather today?"
{"needsVision":false,"visionPrompt":"","focus":"","reason":"Factual question, no visual analysis needed"}

User: "Hello, how are you?"
{"needsVision":false,"visionPrompt":"","focus":"","reason":"Greeting, no visual content involved"}

User: "Help me debug this"
{"needsVision":true,"visionPrompt":"Look for potential issues in this image. Check for: error messages, incorrect values, missing elements, visual bugs, or code problems.","focus":"error_detection","reason":"User needs debugging help, likely visual"}

User: "What did we talk about earlier?"
{"needsVision":false,"visionPrompt":"","focus":"","reason":"Question about conversation history"}

Remember: Output ONLY the JSON object. Be smart about when vision is truly needed.

/no_think`,

    generateVisionPrompt: (userQuery: string) => `Analyze this user query and decide if vision is needed. Respond with ONLY valid JSON (no markdown, no explanation):

User query: "${userQuery}"

JSON:

/no_think`,

    visionAnalysisPrompt: (specificPrompt: string) => `${specificPrompt}

CRITICAL RULES:
1. Describe ONLY what you ACTUALLY SEE - nothing else
2. If something is NOT visible, do NOT mention it at all
3. Do NOT guess, assume, or make up information
4. Do NOT mention things just because they might typically be there
5. Keep responses SHORT and FACTUAL
6. Report text EXACTLY as written

Answer the question directly with only what is visible.

/no_think`,
  },
};
