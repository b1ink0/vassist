/**
 * Icon Map - SVG Icons organized by category
 */

export const iconMap = {
  // ============================================
  // UI CONTROLS
  // ============================================
  
  // Close/Cancel - ✕
  'close': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),

  // Stop - ⏹️
  'stop': (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  ),

  // Pause - ⏸️
  'pause': (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </svg>
  ),

  // Play - ▶️
  'play': (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  ),

  // Record - ⏺️
  'record': (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="12" r="8" />
    </svg>
  ),

  // Check/Success - ✓
  'check': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),

  // Error/Failed - ✗
  'error': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <circle cx="12" cy="12" r="10" />
      <path d="M15 9l-6 6M9 9l6 6" strokeLinecap="round" />
    </svg>
  ),

  // ============================================
  // ACTIONS
  // ============================================

  // Attachment - 📎
  'attachment': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),

  // Clipboard/Copy - 📋
  'clipboard': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  ),

  // Edit - ✏️
  'edit': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  ),

  // Write - ✍️
  'write': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M17 3a2.828 2.828 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),

  // Delete/Trash - 🗑️
  'delete': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),

  // Refresh/Reload - 🔄
  'refresh': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0118.8-4.3M22 12.5a10 10 0 01-18.8 4.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),

  // Regenerate - ↻
  'regenerate': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M1 4v6h6M23 20v-6h-6" />
      <path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15" />
    </svg>
  ),

  // Add/Plus - ➕
  'add': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M12 5v14M5 12h14" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),

  // ============================================
  // STATUS INDICATORS
  // ============================================

  // Loading - ⏳
  'loading': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),

  // Success - ✅
  'success': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
      <path d="M22 4L12 14.01l-3-3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),

  // Error Status - ❌
  'error-status': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <circle cx="12" cy="12" r="10" />
      <path d="M15 9l-6 6M9 9l6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),

  // Warning - ⚠️
  'warning': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),

  // ============================================
  // COMMUNICATION
  // ============================================

  // Chat/Message - 💬
  'chat': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),

  // Send - ➤
  'send': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),

  // Microphone - 🎤
  'microphone': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
      <path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),

  // Speaker/Audio - 🔊
  'speaker': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M11 5L6 9H2v6h4l5 4V5zM19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),

  // Phone/Call - 📞
  'phone': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),

  // ============================================
  // CONTENT TYPES
  // ============================================

  // Image - 🖼️
  'image': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),

  // Audio/Music - 🎵
  'music': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  ),

  // Document - 📄
  'document': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),

  // Note/Text - 📝
  'note': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),

  // Article/News - 📰
  'article': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M4 22h16a2 2 0 002-2V4a2 2 0 00-2-2H8a2 2 0 00-2 2v16a2 2 0 01-2 2zm0 0a2 2 0 01-2-2v-9c0-1.1.9-2 2-2h2" />
      <path d="M18 14h-8M15 18h-5M10 6h8v4h-8V6z" />
    </svg>
  ),

  // Book/Dictionary - 📖
  'book': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
    </svg>
  ),

  // ============================================
  // EMOTIONS/EXPRESSIONS
  // ============================================

  // Happy - 😊
  'happy': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <circle cx="12" cy="12" r="10" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),

  // Thinking - 🤔
  'thinking': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3M12 17h.01" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),

  // Calm - 😌
  'calm': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <circle cx="12" cy="12" r="10" />
      <path d="M8 15h8M9 9h.01M15 9h.01" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),

  // Eye/Show - 👁️
  'eye': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),

  // Hide - 🙈
  'eye-off': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),

  // Wave/Hi - 👋
  'wave': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M12 2v6M12 18v4M4.93 4.93l4.24 4.24M14.83 14.83l4.24 4.24M2 12h6M18 12h4M4.93 19.07l4.24-4.24M14.83 9.17l4.24-4.24" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),

  // ============================================
  // TOOLS/FEATURES
  // ============================================

  // Globe/Translate - 🌐
  'globe': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
    </svg>
  ),

  // Search - 🔍
  'search': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <circle cx="11" cy="11" r="8" />
      <path d="M21 21l-4.35-4.35" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),

  // Key - 🔑
  'key': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),

  // Magic/Enhance - ✨
  'magic': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),

  // Tags/Labels - 🏷️
  'tag': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82zM7 7h.01" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),

  // Settings - ⚙
  'settings': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  ),

  // Tools - 🛠️
  'tools': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
    </svg>
  ),

  // Wrench/Debug - 🔧
  'wrench': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
    </svg>
  ),

  // Stats/Charts - 📊
  'stats': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M18 20V10M12 20V4M6 20v-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),

  // ============================================
  // DIRECTIONS/ARROWS
  // ============================================

  // Up Arrow - ↑
  'arrow-up': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M12 19V5M5 12l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),

  // Down Arrow - ↓
  'arrow-down': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M12 5v14M19 12l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),

  // Left Arrow - ←
  'arrow-left': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),

  // Right Arrow - →
  'arrow-right': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),

  // Undo - ↩️
  'undo': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M3 7v6h6M21 17a9 9 0 00-9-9 9 9 0 00-9 9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),

  // Redo - ↪️
  'redo': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M21 7v6h-6M3 17a9 9 0 019-9 9 9 0 019 9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),

  // Bidirectional - ↔️
  'bidirectional': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M5 9l-3 3 3 3M19 9l3 3-3 3M2 12h20" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),

  // ============================================
  // ACTIVITIES
  // ============================================

  // Walking - 🚶
  'walking': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <circle cx="12" cy="5" r="2" />
      <path d="M10 22v-7M14 22v-6l-2-3-2 1M8 10l4 5 4-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),

  // Meditation/Idle - 🧘
  'meditation': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <circle cx="12" cy="6" r="2" />
      <path d="M12 8v5M8 11l4 2 4-2M12 13v6M9 19h6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),

  // Theater/Actions - 🎭
  'theater': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <circle cx="12" cy="12" r="10" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),

  // Party/Celebrate - 🎉
  'celebrate': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M12 2v4M4 12H2M22 12h-2M19.07 4.93l-1.41 1.41M6.34 17.66l-1.41 1.41M19.07 19.07l-1.41-1.41M6.34 6.34L4.93 4.93M12 18v4M8 12l-2-2M16 12l2-2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),

  // ============================================
  // MISCELLANEOUS
  // ============================================

  // Idea/Tip - 💡
  'idea': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M9 21h6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 3a7 7 0 00-4 12.9V19a1 1 0 001 1h6a1 1 0 001-1v-3.1A7 7 0 0012 3z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),

  // Target - 🎯
  'target': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  ),

  // Professional/Briefcase - 💼
  'briefcase': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
      <path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16" />
    </svg>
  ),

  // Pin/Permanent - 📌
  'pin': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M12 17v5M9 10.76a2 2 0 01-1.11 1.79l-1.78.9A2 2 0 005 15.24V16a1 1 0 001 1h12a1 1 0 001-1v-.76a2 2 0 00-1.11-1.79l-1.78-.9A2 2 0 0115 10.76V7a1 1 0 011-1 2 2 0 000-4H8a2 2 0 000 4 1 1 0 011 1v3.76z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),

  // Star/Temporary - 💫
  'star': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),

  // Location - 📍
  'location': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  ),

  // Empty/Mailbox - 📭
  'empty': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <path d="M22 6l-10 7L2 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),

  // Save/Storage - 💾
  'save': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
      <path d="M17 21v-8H7v8M7 3v5h8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),

  // History/Clock - 🕒
  'history': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),

  // Stop Hand - ✋
  'hand-stop': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M18 11V6a2 2 0 00-4 0v5M14 11V4a2 2 0 00-4 0v7M10 11V6a2 2 0 00-4 0v9a4 4 0 008 0M6 15a2 2 0 012-2h.01" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),

  // Lightning/Fast - ⚡
  'lightning': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),

  // Shuffle/Composite - 🔀
  'shuffle': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),

  // Question/Unknown - ❓
  'question': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3M12 17h.01" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),

  // Formal/Top Hat - 🎩
  'formal': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M6 10h12M6 14h12M8 18h8M12 2L4 6v4h16V6l-8-4z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),

  // Sleeping/Idle - 😴
  'sleeping': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <circle cx="12" cy="12" r="10" />
      <path d="M9 9h.01M15 9h.01M9 15c.5-1 1.5-2 3-2s2.5 1 3 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),

  // Eyes Looking - 👀
  'eyes': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <circle cx="8" cy="12" r="2" />
      <circle cx="16" cy="12" r="2" />
      <path d="M4 12s2-4 4-4 4 4 4 4-2 4-4 4-4-4-4-4zM12 12s2-4 4-4 4 4 4 4-2 4-4 4-4-4-4-4z" />
    </svg>
  ),

  // Yawn - 🥱
  'yawn': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="14" r="3" />
      <path d="M9 9h.01M15 9h.01" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),

  // Surprised - 😮
  'surprised': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="15" r="2" />
      <path d="M9 9h.01M15 9h.01" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),

  // Excited - 🎉 (using celebrate)
  'excited': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M12 2v4M4 12H2M22 12h-2M19.07 4.93l-1.41 1.41M6.34 17.66l-1.41 1.41M19.07 19.07l-1.41-1.41M6.34 6.34L4.93 4.93M12 18v4M8 12l-2-2M16 12l2-2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),

  // Pencil/Edit small - ✎
  'pencil': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),

  // Hourglass (animated) - ⏳
  'hourglass': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M6 2h12v6l-6 4 6 4v6H6v-6l6-4-6-4V2z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),

  // Checkmark (simple) - ✓
  'checkmark': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),

  // X mark (simple) - ✗
  'xmark': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),

  // Diagonal arrows for positioning
  'arrow-top-right': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M7 17L17 7M17 7H9M17 7v8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),

  'arrow-top-left': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M17 17L7 7M7 7h8M7 7v8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),

  'arrow-bottom-right': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M7 7l10 10M17 17V9M17 17H9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),

  'arrow-bottom-left': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M17 7L7 17M7 17h8M7 17V9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),

  // Spinner/Loading (animated) - ⟳
  'spinner': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round">
      <path d="M12 2 A10 10 0 0 1 22 12" />
      <path d="M22 12 A10 10 0 0 1 12 22" opacity="0.5" />
      <path d="M12 22 A10 10 0 0 1 2 12" opacity="0.3" />
      <path d="M2 12 A10 10 0 0 1 12 2" opacity="0.1" />
    </svg>
  ),

  // AI/Circuit - 🤖
  'ai': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      {/* Central processor square */}
      <rect x="9" y="9" width="6" height="6" rx="1" />
      {/* Corner nodes */}
      <circle cx="5" cy="5" r="1.5" />
      <circle cx="19" cy="5" r="1.5" />
      <circle cx="5" cy="19" r="1.5" />
      <circle cx="19" cy="19" r="1.5" />
      {/* Connection lines */}
      <path d="M6.5 5H9M15 5H17.5M5 6.5V9M5 15V17.5M19 6.5V9M19 15V17.5M6.5 19H9M15 19H17.5" strokeLinecap="round" />
    </svg>
  ),
};

export default iconMap;
