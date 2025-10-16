/**
 * Message Types for Extension Communication
 * Shared between content script, background worker, and offscreen document
 */

export const MessageTypes = {
  // AI Service Messages
  AI_CONFIGURE: 'AI_CONFIGURE',
  AI_SEND_MESSAGE: 'AI_SEND_MESSAGE',
  AI_SEND_MESSAGE_STREAM: 'AI_SEND_MESSAGE_STREAM',
  AI_STREAM_TOKEN: 'AI_STREAM_TOKEN', // Streaming token from background to content
  AI_ABORT: 'AI_ABORT',
  AI_TEST_CONNECTION: 'AI_TEST_CONNECTION',
  
  // TTS Service Messages
  TTS_CONFIGURE: 'TTS_CONFIGURE',
  TTS_GENERATE_SPEECH: 'TTS_GENERATE_SPEECH',
  TTS_PROCESS_AUDIO_WITH_LIPSYNC: 'TTS_PROCESS_AUDIO_WITH_LIPSYNC',
  TTS_STOP_PLAYBACK: 'TTS_STOP_PLAYBACK',
  TTS_RESUME_PLAYBACK: 'TTS_RESUME_PLAYBACK',
  TTS_GET_QUEUE_LENGTH: 'TTS_GET_QUEUE_LENGTH',
  TTS_IS_PLAYING: 'TTS_IS_PLAYING',
  TTS_TEST_CONNECTION: 'TTS_TEST_CONNECTION',
  
  // STT Service Messages
  STT_CONFIGURE: 'STT_CONFIGURE',
  STT_START_RECORDING: 'STT_START_RECORDING',
  STT_STOP_RECORDING: 'STT_STOP_RECORDING',
  STT_TRANSCRIBE_AUDIO: 'STT_TRANSCRIBE_AUDIO',
  STT_TEST_RECORDING: 'STT_TEST_RECORDING',
  
  // VMD/BVMD Service Messages
  VMD_GENERATE: 'VMD_GENERATE',
  BVMD_CONVERT: 'BVMD_CONVERT',
  
  // Storage Messages
  STORAGE_GET: 'STORAGE_GET',
  STORAGE_SET: 'STORAGE_SET',
  STORAGE_REMOVE: 'STORAGE_REMOVE',
  STORAGE_CLEAR: 'STORAGE_CLEAR',
  
  // Offscreen Document Messages
  OFFSCREEN_AUDIO_PROCESS: 'OFFSCREEN_AUDIO_PROCESS',
  OFFSCREEN_AUDIO_PLAY: 'OFFSCREEN_AUDIO_PLAY',
  OFFSCREEN_AUDIO_STOP: 'OFFSCREEN_AUDIO_STOP',
  OFFSCREEN_VMD_GENERATE: 'OFFSCREEN_VMD_GENERATE',
  
  // Streaming Events
  STREAM_CHUNK: 'STREAM_CHUNK',
  STREAM_END: 'STREAM_END',
  STREAM_ERROR: 'STREAM_ERROR',
  
  // Tab Management
  TAB_INIT: 'TAB_INIT',
  TAB_CLEANUP: 'TAB_CLEANUP',
  TAB_STATE_UPDATE: 'TAB_STATE_UPDATE',
  
  // Response Types
  SUCCESS: 'SUCCESS',
  ERROR: 'ERROR',
  PROGRESS: 'PROGRESS'
};

export const MessagePriority = {
  HIGH: 0,
  NORMAL: 1,
  LOW: 2
};

/**
 * Create a message with proper structure
 */
export function createMessage(type, data = {}, options = {}) {
  return {
    type,
    data,
    requestId: options.requestId || generateRequestId(),
    tabId: options.tabId || null,
    timestamp: Date.now(),
    priority: options.priority || MessagePriority.NORMAL
  };
}

/**
 * Create a response message
 */
export function createResponse(requestId, data = {}, success = true) {
  return {
    type: success ? MessageTypes.SUCCESS : MessageTypes.ERROR,
    requestId,
    data,
    timestamp: Date.now()
  };
}

/**
 * Generate unique request ID
 */
export function generateRequestId() {
  return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
