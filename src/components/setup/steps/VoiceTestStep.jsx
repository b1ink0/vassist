import { useState } from 'react';
import { useSetup } from '../../../contexts/SetupContext';
import { TTSServiceProxy, STTServiceProxy } from '../../../services/proxies';
import { Icon } from '../../icons';

const VoiceTestStep = () => {
  const { setupData, markStepComplete, nextStep } = useSetup();
  
  // TTS Test State
  const [ttsText, setTtsText] = useState('Hello! This is a test of the text-to-speech system.');
  const [ttsPlaying, setTtsPlaying] = useState(false);
  const [ttsError, setTtsError] = useState(null);
  const [ttsSuccess, setTtsSuccess] = useState(false);

  // STT Test State
  const [sttRecording, setSttRecording] = useState(false);
  const [sttTranscription, setSttTranscription] = useState('');
  const [sttError, setSttError] = useState(null);
  const [sttSuccess, setSttSuccess] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);

  // Recording animation
  const [recordingInterval, setRecordingInterval] = useState(null);

  const handleTTSTest = async () => {
    if (!ttsText.trim()) {
      setTtsError('Please enter some text to test');
      return;
    }

    setTtsPlaying(true);
    setTtsError(null);
    setTtsSuccess(false);

    try {
      // Configure TTS service before testing
      if (setupData?.ttsConfig) {
        await TTSServiceProxy.configure(setupData.ttsConfig);
      }
      
      // Generate and play audio using the configured TTS service
      const audioItems = await TTSServiceProxy.generateChunkedSpeech(ttsText);
      
      if (!audioItems || audioItems.length === 0) {
        throw new Error('No audio generated - TTS may not be configured properly');
      }
      
      await TTSServiceProxy.playAudioSequence(audioItems, 'test_tts');
      
      // Cleanup blob URLs
      const urls = audioItems.map(item => item.audioUrl).filter(Boolean);
      if (urls.length > 0) {
        TTSServiceProxy.cleanupBlobUrls(urls);
      }
      
      setTtsSuccess(true);
      setTtsError(null);
    } catch (error) {
      setTtsError(error.message || 'Failed to play text-to-speech');
      setTtsSuccess(false);
    } finally {
      setTtsPlaying(false);
    }
  };

  const handleSTTTest = async () => {
    setSttRecording(true);
    setSttError(null);
    setSttSuccess(false);
    setSttTranscription('');
    setRecordingTime(0);

    // Start recording timer (5 seconds)
    let time = 0;
    const interval = setInterval(() => {
      time += 0.1;
      setRecordingTime(time);
      
      // Stop timer after 5 seconds
      if (time >= 5) {
        clearInterval(interval);
      }
    }, 100);
    setRecordingInterval(interval);

    try {
      // Configure STT service before testing
      if (setupData?.sttConfig && setupData.sttConfig.provider) {
        const sttProvider = setupData.sttConfig.provider;
        
        // Build complete STT config with defaults
        const fullSTTConfig = {
          enabled: true,
          provider: sttProvider,
          'chrome-ai-multimodal': {
            temperature: 0.1,
            topK: 3,
            outputLanguage: setupData.sttConfig.chromeAi?.outputLanguage || 'en',
          },
          openai: {
            apiKey: setupData.sttConfig.openai?.apiKey || '',
            model: setupData.sttConfig.openai?.model || 'whisper-1',
            language: setupData.sttConfig.openai?.language || 'en',
            temperature: setupData.sttConfig.openai?.temperature || 0,
          },
          'openai-compatible': {
            endpoint: setupData.sttConfig['openai-compatible']?.endpoint || 'http://localhost:8000',
            apiKey: setupData.sttConfig['openai-compatible']?.apiKey || '',
            model: setupData.sttConfig['openai-compatible']?.model || 'whisper',
            language: setupData.sttConfig['openai-compatible']?.language || 'en',
            temperature: setupData.sttConfig['openai-compatible']?.temperature || 0,
          },
        };
        
        await STTServiceProxy.configure(fullSTTConfig);
      }
      
      // Use testRecording which returns transcription text directly
      const transcription = await STTServiceProxy.testRecording(5);
      
      if (transcription && typeof transcription === 'string' && transcription.trim()) {
        setSttTranscription(transcription);
        setSttSuccess(true);
        setSttError(null);
      } else {
        setSttError('No speech detected. Please try again.');
      }
    } catch (error) {
      setSttError(error.message || 'Failed to record audio');
      setSttSuccess(false);
    } finally {
      setSttRecording(false);
      if (recordingInterval) {
        clearInterval(recordingInterval);
        setRecordingInterval(null);
      }
    }
  };

  const handleContinue = () => {
    markStepComplete();
    nextStep();
  };

  const handleSkip = () => {
    markStepComplete();
    nextStep();
  };

  const ttsProvider = setupData?.ttsProvider || 'kokoro';
  const sttProvider = setupData?.sttProvider || 'chrome-ai-multimodal';

  return (
    <div className="setup-step voice-test-step">
      <div className="step-header mb-8">
        <h2 className="text-3xl font-bold mb-2 bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
          Test Voice Features
        </h2>
        <p className="text-white/90">
          Try out your text-to-speech and speech-to-text configuration.
        </p>
      </div>

      {/* Info Banner */}
      <div className="glass-container rounded-xl p-4 mb-6 border-2 border-blue-500/30">
        <div className="flex items-start gap-3">
          <Icon name="info" size={20} className="text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-blue-400 mb-1">Testing is Optional</h3>
            <p className="text-xs text-white/80">
              Voice features are optional and can be configured later in settings. 
              You can skip this test if you prefer.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* TTS Test */}
        <div className="glass-container rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
              <Icon name="volume" size={20} className="text-purple-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Text-to-Speech Test</h3>
              <p className="text-xs text-white/60">Provider: {ttsProvider}</p>
            </div>
          </div>

          <div className="space-y-4">
            {/* Text Input */}
            <div>
              <label className="block text-sm font-medium text-white/90 mb-2">
                Enter text to speak
              </label>
              <textarea
                value={ttsText}
                onChange={(e) => setTtsText(e.target.value)}
                placeholder="Type something to hear..."
                rows={3}
                className="w-full px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:border-purple-400 resize-none"
              />
            </div>

            {/* Test Button */}
            <button
              onClick={handleTTSTest}
              disabled={ttsPlaying}
              className="glass-button w-full px-4 py-3 text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {ttsPlaying ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>Playing...</span>
                </>
              ) : (
                <>
                  <Icon name="volume" size={16} />
                  <span>Test Voice</span>
                </>
              )}
            </button>

            {/* Success Message */}
            {ttsSuccess && (
              <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/30">
                <div className="flex items-center gap-2">
                  <Icon name="check" size={16} className="text-green-400" />
                  <span className="text-sm text-green-300">TTS is working! 🎉</span>
                </div>
              </div>
            )}

            {/* Error Message */}
            {ttsError && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                <div className="flex items-start gap-2">
                  <Icon name="error" size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm text-red-300 font-semibold mb-1">TTS Test Failed</p>
                    <p className="text-xs text-red-200/80">{ttsError}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* STT Test */}
        <div className="glass-container rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-pink-500/20 flex items-center justify-center">
              <Icon name="mic" size={20} className="text-pink-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Speech-to-Text Test</h3>
              <p className="text-xs text-white/60">Provider: {sttProvider}</p>
            </div>
          </div>

          <div className="space-y-4">
            {/* Instructions */}
            <div className="p-3 rounded-lg bg-white/5 border border-white/10">
              <p className="text-xs text-white/70">
                Click the button below and speak clearly. Recording will auto-stop after 5 seconds.
              </p>
            </div>

            {/* Record Button */}
            <button
              onClick={handleSTTTest}
              disabled={false}
              className={`glass-button w-full px-4 py-3 text-sm font-medium rounded-lg flex items-center justify-center gap-2 ${
                sttRecording ? 'bg-red-500/20 border-red-500/50' : ''
              }`}
            >
              {sttRecording ? (
                <>
                  <div className="relative flex items-center justify-center">
                    <div className="w-4 h-4 bg-red-500 rounded-full animate-pulse"></div>
                    <div className="absolute w-6 h-6 bg-red-500/30 rounded-full animate-ping"></div>
                  </div>
                  <span>Recording... {recordingTime.toFixed(1)}s</span>
                </>
              ) : (
                <>
                  <Icon name="mic" size={16} />
                  <span>Start Recording</span>
                </>
              )}
            </button>

            {/* Transcription */}
            {sttTranscription && (
              <div className="p-3 rounded-lg bg-white/10 border border-white/20">
                <p className="text-xs text-white/60 mb-1">Transcription:</p>
                <p className="text-sm text-white font-medium">{sttTranscription}</p>
              </div>
            )}

            {/* Success Message */}
            {sttSuccess && (
              <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/30">
                <div className="flex items-center gap-2">
                  <Icon name="check" size={16} className="text-green-400" />
                  <span className="text-sm text-green-300">STT is working! 🎉</span>
                </div>
              </div>
            )}

            {/* Error Message */}
            {sttError && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                <div className="flex items-start gap-2">
                  <Icon name="error" size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm text-red-300 font-semibold mb-1">STT Test Failed</p>
                    <p className="text-xs text-red-200/80">{sttError}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tips */}
      <div className="glass-container rounded-xl p-6 mb-6 border-2 border-purple-500/30">
        <h3 className="text-lg font-semibold text-purple-400 mb-3 flex items-center gap-2">
          <Icon name="info" size={18} />
          <span>Troubleshooting Tips</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-white/80">
          <div>
            <p className="font-semibold text-white mb-1">TTS Not Working?</p>
            <ul className="space-y-1 text-xs">
              <li>• Check your device volume</li>
              <li>• Verify the provider is configured correctly</li>
              <li>• Try a different TTS provider in settings</li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-white mb-1">STT Not Working?</p>
            <ul className="space-y-1 text-xs">
              <li>• Allow microphone permissions</li>
              <li>• Speak clearly and close to microphone</li>
              <li>• Check provider configuration in settings</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-between pt-4">
        <button
          onClick={handleSkip}
          className="glass-button px-6 py-3 text-sm font-medium rounded-lg text-white/60 hover:text-white"
        >
          Skip Testing
        </button>
        <button
          onClick={handleContinue}
          className="glass-button px-8 py-3 text-base font-medium rounded-lg"
        >
          Continue
        </button>
      </div>
    </div>
  );
};

export default VoiceTestStep;
