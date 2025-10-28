/**
 * StreamingText Component
 */

import { useState, useEffect, useRef } from 'react';

const StreamingText = ({
  text = '',
  wordsPerSecond = 40, // Words per second (40 wps ≈ 200 chars/sec at avg 5 chars/word)
  showCursor = false, // Show typing cursor during animation
  onComplete = null, // Callback when animation completes
  className = '', // Additional CSS classes
  disabled = false, // Disable animation (show full text immediately)
  forceComplete = false, // Instantly complete animation (smooth fade-in of remaining text)
}) => {
  const [displayedWords, setDisplayedWords] = useState([]);
  const [isInstantComplete, setIsInstantComplete] = useState(false);
  const [instantCompleteStartIndex, setInstantCompleteStartIndex] = useState(0);
  const wordsArrayRef = useRef([]);
  const displayedCountRef = useRef(0);
  const animationIdRef = useRef(null);
  const startTimeRef = useRef(null);
  const previousForceCompleteRef = useRef(false);

  /**
   * Handle instant completion when forceComplete becomes true
   */
  useEffect(() => {
    // Check if forceComplete changed from false to true
    if (forceComplete && !previousForceCompleteRef.current) {
      // Save the index where instant completion starts
      setInstantCompleteStartIndex(displayedCountRef.current);
      
      // Cancel any ongoing animation
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
        animationIdRef.current = null;
      }

      // Show all words immediately
      setDisplayedWords(wordsArrayRef.current);
      displayedCountRef.current = wordsArrayRef.current.length;
      setIsInstantComplete(true);

      // Call completion callback
      if (onComplete) {
        onComplete();
      }
    }

    // Reset instant complete flag when forceComplete goes back to false
    if (!forceComplete && previousForceCompleteRef.current) {
      setIsInstantComplete(false);
      setInstantCompleteStartIndex(0);
    }

    previousForceCompleteRef.current = forceComplete;
  }, [forceComplete, onComplete]);

  /**
   * Word-by-word animation with framerate-independent timing
   */
  useEffect(() => {
    // Split text into words AND chunks for long strings without spaces
    // This prevents waiting forever for responses like URLs or long code blocks
    const MAX_CHUNK_SIZE = 50;
    let chunks = [];
    
    // First split by whitespace to get words
    const words = text.split(/(\s+)/);
    
    // Then check each word - if it's too long, break it into chunks
    words.forEach(word => {
      if (word.length <= MAX_CHUNK_SIZE || /^\s+$/.test(word)) {
        // Word is short enough or is whitespace - keep as is
        chunks.push(word);
      } else {
        // Word is too long - break into chunks
        for (let i = 0; i < word.length; i += MAX_CHUNK_SIZE) {
          chunks.push(word.slice(i, i + MAX_CHUNK_SIZE));
        }
      }
    });
    
    const previousWordCount = wordsArrayRef.current.length;
    wordsArrayRef.current = chunks;

    // If animation is disabled, show all chunks immediately
    if (disabled) {
      setDisplayedWords(chunks);
      displayedCountRef.current = chunks.length;
      return;
    }

    // If text is empty, reset
    if (chunks.length === 0 || (chunks.length === 1 && chunks[0] === '')) {
      setDisplayedWords([]);
      displayedCountRef.current = 0;
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
        animationIdRef.current = null;
        startTimeRef.current = null;
      }
      return;
    }

    // If text got shorter (e.g., cleared), reset
    if (chunks.length < previousWordCount) {
      setDisplayedWords([]);
      displayedCountRef.current = 0;
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
        animationIdRef.current = null;
      }
      startTimeRef.current = null;
    }

    // If we're already showing all chunks, nothing to do
    if (displayedCountRef.current >= chunks.length) {
      return;
    }

    // Calculate milliseconds per word
    const msPerWord = 1000 / wordsPerSecond;
    
    // Animation loop with framerate-independent timing
    const animate = (currentTime) => {
      // Initialize start time on first frame
      if (startTimeRef.current === null) {
        startTimeRef.current = currentTime;
      }

      // Calculate elapsed time
      const elapsed = currentTime - startTimeRef.current;
      
      // Calculate how many words should be displayed based on elapsed time
      const targetWordCount = Math.min(
        Math.floor(elapsed / msPerWord) + 1,
        wordsArrayRef.current.length
      );
      
      // Update displayed words if we need to show more
      if (targetWordCount > displayedCountRef.current) {
        const newWords = wordsArrayRef.current.slice(0, targetWordCount);
        setDisplayedWords(newWords);
        displayedCountRef.current = targetWordCount;
        
        // Dispatch event to notify parent that a word was added (for auto-scroll)
        const event = new CustomEvent('streamingWordAdded');
        window.dispatchEvent(event);
      }
      
      // Check if complete
      if (displayedCountRef.current >= wordsArrayRef.current.length) {
        if (onComplete) {
          onComplete();
        }
        animationIdRef.current = null;
        return;
      }
      
      // Continue animation
      animationIdRef.current = requestAnimationFrame(animate);
    };

    // Start animation if not already running
    if (!animationIdRef.current) {
      animationIdRef.current = requestAnimationFrame(animate);
    }

    // Cleanup
    return () => {
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
        animationIdRef.current = null;
      }
    };
  }, [text, wordsPerSecond, disabled, onComplete]);

  // Check if still animating
  const isAnimating = displayedCountRef.current < wordsArrayRef.current.length;

  return (
    <span className={className}>
      {displayedWords.map((word, index) => {
        // Check if this is whitespace
        const isWhitespace = /^\s+$/.test(word);
        
        if (isWhitespace) {
          return <span key={index}>{word}</span>;
        }
        
        // Determine animation class based on how word appeared
        let animationClass = "streaming-word-fast";
        
        // If instant complete was triggered, words that weren't displayed yet get instant fade
        if (isInstantComplete && index >= instantCompleteStartIndex) {
          animationClass = "streaming-word-instant-fade";
        }
        
        // Render word with fade-in animation
        return (
          <span 
            key={index} 
            className={animationClass}
          >
            {word}
          </span>
        );
      })}
      {showCursor && isAnimating && !isInstantComplete && (
        <span className="streaming-cursor-glow" aria-hidden="true" />
      )}
    </span>
  );
};

export default StreamingText;
