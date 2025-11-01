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
    define: (word) => `Provide a concise dictionary definition for the word: "${word}"

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

    synonyms: (word) => `List 8-10 synonyms for the word: "${word}"

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

    antonyms: (word) => `List antonyms (opposite words) for: "${word}"

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

    pronunciation: (word) => `Provide pronunciation guide for the word: "${word}"

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

    examples: (word) => `Provide 4-5 example sentences using the word: "${word}"

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
    moreFormal: (text) => `Rewrite the following text in a more formal, professional tone. Return ONLY the rewritten text with no explanations:

${text}`,

    // More casual tone
    moreCasual: (text) => `Rewrite the following text in a more casual, conversational tone. Return ONLY the rewritten text with no explanations:

${text}`,

    // Make shorter
    shorter: (text) => `Rewrite the following text to be shorter while preserving key information. Return ONLY the rewritten text with no explanations:

${text}`,

    // Make longer
    longer: (text) => `Rewrite the following text to be longer with more detail and elaboration. Return ONLY the rewritten text with no explanations:

${text}`,

    // Plain text format
    plainText: (text) => `Rewrite the following text using plain text only, no markdown. Return ONLY the rewritten text with no explanations:

${text}`,

    // Markdown format
    markdown: (text) => `Rewrite the following text using markdown formatting. Return ONLY the rewritten text with no explanations:

${text}`,

    // Fix grammar (useful rewrite action)
    grammar: (text) => `Rewrite the following text to fix grammar errors. Return ONLY the corrected text with no explanations:

${text}`,

    // Fix spelling (useful rewrite action)
    spelling: (text) => `Rewrite the following text to fix spelling errors. Return ONLY the corrected text with no explanations:

${text}`,

    // Improve clarity
    clarity: (text) => `Rewrite the following text to improve clarity. Return ONLY the improved text with no explanations:

${text}`,

    // Professional tone
    professional: (text) => `Rewrite the following text in a professional, business-appropriate tone. Return ONLY the rewritten text with no explanations:

${text}`,

    // Formal style
    formal: (text) => `Rewrite the following text in a formal, academic style. Return ONLY the rewritten text with no explanations:

${text}`,

    // Simplify
    simplify: (text) => `Rewrite the following text to be simpler and easier to understand. Use simpler words and shorter sentences. Return ONLY the simplified text with no explanations:

${text}`,

    // Expand
    expand: (text) => `Rewrite the following text to be more detailed and comprehensive. Return ONLY the expanded text with no explanations:

${text}`,

    // Make concise
    concise: (text) => `Rewrite the following text to be more concise while preserving meaning. Return ONLY the concise version with no explanations:

${text}`,
  },

  writer: {
    write: (prompt) => `${prompt}`,

    formal: (prompt) => `Write in a formal, professional tone:\n\n${prompt}`,

    neutral: (prompt) => `Write in a neutral, balanced tone:\n\n${prompt}`,

    casual: (prompt) => `Write in a casual, conversational tone:\n\n${prompt}`,

    short: (prompt) => `Write a brief, concise response (1-2 paragraphs):\n\n${prompt}`,

    medium: (prompt) => `Write a moderate length response (2-3 paragraphs):\n\n${prompt}`,

    long: (prompt) => `Write a detailed, comprehensive response (4+ paragraphs):\n\n${prompt}`,

    plainText: (prompt) => `Write using plain text only, no markdown:\n\n${prompt}`,

    markdown: (prompt) => `Write using markdown formatting:\n\n${prompt}`,
  },

  image: {
    describe: (imageCount) => 
      imageCount === 1
        ? 'Describe this image in detail.'
        : `Describe these ${imageCount} images in detail.`,

    extractText: (imageCount) =>
      imageCount === 1
        ? 'Extract and return all text visible in this image. Format it clearly and preserve the structure.'
        : `Extract and return all text visible in these ${imageCount} images. Format it clearly and preserve the structure for each image.`,

    identifyObjects: (imageCount) =>
      imageCount === 1
        ? 'Identify and list all objects visible in this image.'
        : `Identify and list all objects visible in these ${imageCount} images.`,
  },

  audio: {
    transcribe: 'Transcribe this audio accurately. Return only the transcription.',
    
    summarize: 'Listen to this audio and provide a concise summary of its content.',
    
    translate: (targetLanguage) => 
      `Transcribe this audio and translate it to ${targetLanguage}. Provide both the original transcription and the translation.`,
  },

  documentInteraction: {
    analyzerSystemPrompt: `You are a context analyzer. Your job is to analyze user queries and determine what information from the current webpage would be helpful to answer the query.

Respond ONLY with a valid JSON object in this exact format:
{
  "needsContext": true/false,
  "contextType": "text|links|all|none",
  "selector": "CSS selector or empty string",
  "reason": "Brief explanation"
}

Examples:
- "What is this page about?" -> {"needsContext": true, "contextType": "text", "selector": "main, article, body", "reason": "Need page content to summarize"}
- "Summarize the main heading" -> {"needsContext": true, "contextType": "text", "selector": "h1, h2", "reason": "User wants headings"}
- "What time is it?" -> {"needsContext": false, "contextType": "none", "selector": "", "reason": "General knowledge question"}
- "What links are on this page?" -> {"needsContext": true, "contextType": "links", "selector": "a[href]", "reason": "User wants to know about links"}
- "Tell me everything on this page" -> {"needsContext": true, "contextType": "all", "selector": "", "reason": "User wants complete page overview"}`,

    analyzeQuery: (userQuery) => `Analyze this user query and determine what page context is needed:\n\n"${userQuery}"`,
  },
};
