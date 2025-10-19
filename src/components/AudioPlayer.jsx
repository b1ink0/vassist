import { useState, useRef, useEffect } from 'react';

const AudioPlayer = ({ audioUrl, isLightBackground = false }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => setDuration(audio.duration);
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('ended', handleEnded);
    };
  }, []);

  const togglePlayPause = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (e) => {
    const audio = audioRef.current;
    if (!audio) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    audio.currentTime = percentage * duration;
  };

  const formatTime = (time) => {
    if (!time || isNaN(time)) return '0:00';
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className={`glass-input ${isLightBackground ? 'glass-input-dark' : ''} p-3 rounded-lg flex items-center gap-3 w-full`}>
      <audio ref={audioRef} src={audioUrl} preload="metadata" />
      
      {/* Play/Pause Button */}
      <button
        onClick={togglePlayPause}
        className={`glass-button ${isLightBackground ? 'glass-button-dark' : ''} w-10 h-10 rounded-full flex items-center justify-center hover:bg-purple-500/20 transition-all flex-shrink-0`}
        title={isPlaying ? 'Pause' : 'Play'}
      >
        <span className="text-xl">
          {isPlaying ? '⏸️' : '▶️'}
        </span>
      </button>

      {/* Progress Bar Container */}
      <div className="flex-1 flex flex-col gap-1 min-w-0">
        {/* Progress Bar */}
        <div
          onClick={handleSeek}
          className="relative h-2 rounded-full cursor-pointer bg-white/10 hover:bg-white/15 transition-colors"
        >
          {/* Progress Fill */}
          <div
            className="absolute top-0 left-0 h-full rounded-full bg-gradient-to-r from-purple-500 to-purple-400 transition-all"
            style={{ width: `${progress}%` }}
          />
          
          {/* Progress Thumb */}
          <div
            className="absolute top-1/2 w-3 h-3 rounded-full bg-purple-400 shadow-lg transition-all pointer-events-none"
            style={{ 
              left: `calc(${progress}% - 6px)`,
              transform: 'translateY(-50%)'
            }}
          />
        </div>

        {/* Time Display */}
        <div className={`flex justify-between text-xs ${isLightBackground ? 'glass-text' : 'glass-text-black'} px-1`}>
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Audio Icon */}
      <div className="flex-shrink-0">
        <span className="text-xl">🎵</span>
      </div>
    </div>
  );
};

export default AudioPlayer;
