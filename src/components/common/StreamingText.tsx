/**
 * @fileoverview Streaming text animation component with word-by-word reveal.
 * Features framerate-independent timing, smooth height animation, and instant completion support.
 */

import { useState, useEffect, useRef } from 'react';

/**
 * Streaming text component with word-by-word animation.
 * 
 * @component
 * @param {Object} props - Component props
 * @param {string} [props.text=''] - Text to display with streaming animation
 * @param {number} [props.wordsPerSecond=40] - Animation speed (40 wps ≈ 200 chars/sec)
 * @param {boolean} [props.showCursor=false] - Show typing cursor during animation
 * @param {Function} [props.onComplete=null] - Callback when animation completes
 * @param {string} [props.className=''] - Additional CSS classes
 * @param {boolean} [props.disabled=false] - Disable animation (show full text immediately)
 * @param {boolean} [props.forceComplete=false] - Instantly complete animation with smooth fade-in
 * @param {boolean} [props.smoothHeightAnimation=false] - Enable smooth height animation (performance impact)
 * @returns {JSX.Element} Streaming text component
 */
const StreamingText = ({
  text = '',
  wordsPerSecond = 40,
  showCursor = false,
  onComplete = null,
  className = '',
  disabled = false,
  forceComplete = false,
  smoothHeightAnimation = false,
}) => {
  const [displayedWords, setDisplayedWords] = useState([]);
  const [isInstantComplete, setIsInstantComplete] = useState(false);
  const [instantCompleteStartIndex, setInstantCompleteStartIndex] = useState(0);
  const [containerHeight, setContainerHeight] = useState('auto');
  const wordsArrayRef = useRef([]);
  const displayedCountRef = useRef(0);
  const animationIdRef = useRef(null);
  const startTimeRef = useRef(null);
  const previousForceCompleteRef = useRef(false);
  const contentRef = useRef(null);
  const heightRafRef = useRef(null);
  const currentHeightRef = useRef(0);
  const targetHeightRef = useRef(0);
  const initializedRef = useRef(false);
  const lastStateUpdateRef = useRef(0);

  useEffect(() => {
    if (forceComplete && !previousForceCompleteRef.current) {
      setInstantCompleteStartIndex(displayedCountRef.current);
      
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
        animationIdRef.current = null;
      }

      setDisplayedWords(wordsArrayRef.current);
      displayedCountRef.current = wordsArrayRef.current.length;
      setIsInstantComplete(true);

      if (onComplete) {
        onComplete();
      }
    }

    if (!forceComplete && previousForceCompleteRef.current) {
      setIsInstantComplete(false);
      setInstantCompleteStartIndex(0);
    }

    previousForceCompleteRef.current = forceComplete;
  }, [forceComplete, onComplete]);

  useEffect(() => {
    const MAX_CHUNK_SIZE = 50;
    let chunks = [];
    
    const words = text.split(/(\s+)/);
    
    words.forEach(word => {
      if (word.length <= MAX_CHUNK_SIZE || /^\s+$/.test(word)) {
        chunks.push(word);
      } else {
        for (let i = 0; i < word.length; i += MAX_CHUNK_SIZE) {
          chunks.push(word.slice(i, i + MAX_CHUNK_SIZE));
        }
      }
    });
    
    const previousWordCount = wordsArrayRef.current.length;
    wordsArrayRef.current = chunks;

    if (disabled) {
      setDisplayedWords(chunks);
      displayedCountRef.current = chunks.length;
      return;
    }

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

    if (displayedCountRef.current >= chunks.length) {
      return;
    }

    const msPerWord = 1000 / wordsPerSecond;
    
    const animate = (currentTime) => {
      if (startTimeRef.current === null) {
        startTimeRef.current = currentTime;
      }

      const elapsed = currentTime - startTimeRef.current;
      
      const targetWordCount = Math.min(
        Math.floor(elapsed / msPerWord) + 1,
        wordsArrayRef.current.length
      );
      
      const timeSinceLastUpdate = currentTime - lastStateUpdateRef.current;
      const shouldUpdate = timeSinceLastUpdate >= 16 || targetWordCount >= wordsArrayRef.current.length;
      
      if (targetWordCount > displayedCountRef.current && shouldUpdate) {
        const newWords = wordsArrayRef.current.slice(0, targetWordCount);
        setDisplayedWords(newWords);
        displayedCountRef.current = targetWordCount;
        lastStateUpdateRef.current = currentTime;
        
        const event = new CustomEvent('streamingWordAdded');
        window.dispatchEvent(event);
      } else if (targetWordCount > displayedCountRef.current) {
        displayedCountRef.current = targetWordCount;
      }
      
      if (displayedCountRef.current >= wordsArrayRef.current.length) {
        if (displayedCountRef.current !== displayedWords.length) {
          setDisplayedWords(wordsArrayRef.current);
        }
        if (onComplete) {
          onComplete();
        }
        animationIdRef.current = null;
        return;
      }
      
      animationIdRef.current = requestAnimationFrame(animate);
    };

    if (!animationIdRef.current) {
      animationIdRef.current = requestAnimationFrame(animate);
    }

    return () => {
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
        animationIdRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, wordsPerSecond, disabled, onComplete]);

  useEffect(() => {
    if (!smoothHeightAnimation) {
      setContainerHeight('auto');
      return;
    }

    const TRANSITION_SPEED = 0.2;
    const MIN_STEP = 0.1;
    let lastSetHeight = 0;
    
    const updateHeight = () => {
      if (contentRef.current) {
        const childHeight = contentRef.current.scrollHeight;
        
        if (!initializedRef.current && childHeight > 0) {
          currentHeightRef.current = childHeight;
          targetHeightRef.current = childHeight;
          lastSetHeight = childHeight;
          setContainerHeight(childHeight + 'px');
          initializedRef.current = true;
        }
        
        if (childHeight !== targetHeightRef.current) {
          targetHeightRef.current = childHeight;
        }
        
        const diff = Math.abs(currentHeightRef.current - targetHeightRef.current);
        if (diff > 0.5) {
          const step = Math.max((targetHeightRef.current - currentHeightRef.current) * TRANSITION_SPEED, MIN_STEP);
          currentHeightRef.current += step;
          
          if (Math.abs(currentHeightRef.current - targetHeightRef.current) < 0.5) {
            currentHeightRef.current = targetHeightRef.current;
          }
          
          if (Math.abs(currentHeightRef.current - lastSetHeight) > 0.5) {
            lastSetHeight = currentHeightRef.current;
            setContainerHeight(currentHeightRef.current + 'px');
          }
        } else if (diff > 0 && Math.abs(currentHeightRef.current - lastSetHeight) > 0.1) {
          currentHeightRef.current = targetHeightRef.current;
          lastSetHeight = currentHeightRef.current;
          setContainerHeight(currentHeightRef.current + 'px');
        }
      }
      
      if (displayedWords.length > 0) {
        heightRafRef.current = requestAnimationFrame(updateHeight);
      }
    };
    
    if (displayedWords.length > 0 && !heightRafRef.current) {
      heightRafRef.current = requestAnimationFrame(updateHeight);
    }
    
    if (displayedWords.length === 0 && heightRafRef.current) {
      cancelAnimationFrame(heightRafRef.current);
      heightRafRef.current = null;
      initializedRef.current = false;
      currentHeightRef.current = 0;
      targetHeightRef.current = 0;
      setContainerHeight('auto');
    }
    
    return () => {
      if (heightRafRef.current) {
        cancelAnimationFrame(heightRafRef.current);
        heightRafRef.current = null;
      }
    };
  }, [displayedWords.length, smoothHeightAnimation]);

  const isAnimating = displayedCountRef.current < wordsArrayRef.current.length;

  return (
    <span 
      className={className}
      style={smoothHeightAnimation ? {
        display: 'inline-block',
        height: containerHeight,
        overflow: 'hidden',
        verticalAlign: 'top',
      } : {}}
    >
      <span 
        ref={contentRef}
        style={smoothHeightAnimation ? {
          display: 'inline-block',
          width: '100%',
        } : {}}
      >
      {displayedWords.map((word, index) => {
        const isWhitespace = /^\s+$/.test(word);
        
        if (isWhitespace) {
          return <span key={index}>{word}</span>;
        }
        
        let animationClass = "streaming-word-fast";
        
        if (isInstantComplete && index >= instantCompleteStartIndex) {
          animationClass = "streaming-word-instant-fade";
        }
        
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
    </span>
  );
};

export default StreamingText;
