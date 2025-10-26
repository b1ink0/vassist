/**
 * Centralized Prompt Configuration
 * All AI prompts used throughout the application
 */

export const PromptConfig = {
  // Dictionary Prompts
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

  // Text Improvement Prompts
  textImprovement: {
    grammar: (text) => `Fix grammar errors in the following text. Return ONLY the corrected text with no explanations:

${text}`,

    spelling: (text) => `Fix spelling errors in the following text. Return ONLY the corrected text with no explanations:

${text}`,

    clarity: (text) => `Improve clarity of the following text. Return ONLY the improved text with no explanations:

${text}`,

    concise: (text) => `Make the following text more concise while preserving meaning. Return ONLY the concise version with no explanations:

${text}`,

    professional: (text) => `Make the following text more professional in tone. Return ONLY the professional version with no explanations:

${text}`,

    casual: (text) => `Make the following text more casual and friendly in tone. Return ONLY the casual version with no explanations:

${text}`,

    expand: (text) => `Expand the following text with more detail and elaboration. Return ONLY the expanded version with no explanations:

${text}`,

    formal: (text) => `Rewrite the following text in a formal, academic style. Return ONLY the rewritten text with no explanations:

${text}`,

    simplify: (text) => `Simplify the following text to make it easier to understand. Use simpler words and shorter sentences. Return ONLY the simplified text with no explanations:

${text}`,
  },

  // Image Analysis Prompts
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

  // Audio Analysis Prompts
  audio: {
    transcribe: 'Transcribe this audio accurately. Return only the transcription.',
    
    summarize: 'Listen to this audio and provide a concise summary of its content.',
    
    translate: (targetLanguage) => 
      `Transcribe this audio and translate it to ${targetLanguage}. Provide both the original transcription and the translation.`,
  },
};
