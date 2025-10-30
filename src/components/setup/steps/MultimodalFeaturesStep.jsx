import { useState, useRef } from 'react';
import { useSetup } from '../../../contexts/SetupContext';
import { AIServiceProxy } from '../../../services/proxies';
import Icon from '../../icons/Icon';

const MultimodalFeaturesStep = () => {
  const { markStepComplete, updateSetupData, setupData, nextStep } = useSetup();
  const [imageSupport, setImageSupport] = useState(true);
  const [audioSupport, setAudioSupport] = useState(true);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const [selectedAudio, setSelectedAudio] = useState(null);
  const [testPrompt, setTestPrompt] = useState('');
  const [testResponse, setTestResponse] = useState('');
  
  const imageInputRef = useRef(null);
  const audioInputRef = useRef(null);

  const usingChromeAI = setupData?.llmProvider === 'chrome-ai';
  const llmProvider = setupData?.llmProvider || 'chrome-ai';

  const handleImageSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setSelectedImage({
          file,
          url: event.target.result,
          name: file.name
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAudioSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setSelectedAudio({
          file,
          url: event.target.result,
          name: file.name
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const testMultimodalSupport = async () => {
    if (!testPrompt && !selectedImage && !selectedAudio) {
      setTestResult({ 
        success: false, 
        message: 'Please enter a prompt and/or attach an image or audio file to test.' 
      });
      return;
    }

    setTesting(true);
    setTestResult(null);
    setTestResponse('');

    try {
      // Build the message with attachments
      const attachments = [];
      
      if (selectedImage && imageSupport) {
        attachments.push({
          type: 'image',
          data: selectedImage.url,
          mimeType: selectedImage.file.type
        });
      }
      
      if (selectedAudio && audioSupport) {
        attachments.push({
          type: 'audio',
          data: selectedAudio.url,
          mimeType: selectedAudio.file.type
        });
      }

      const prompt = testPrompt || 'Describe what you see/hear in the attached file(s).';

      // Create message in the format AIServiceProxy expects
      const messages = [{
        role: 'user',
        content: prompt,
        attachments: attachments.length > 0 ? attachments : undefined
      }];

      // Test with the AI service
      let fullResponse = '';
      const result = await AIServiceProxy.sendMessage(messages, (chunk) => {
        fullResponse += chunk;
        setTestResponse(fullResponse);
      });

      // Extract the actual response text from the result object
      const responseText = result?.response || fullResponse;
      
      if (responseText) {
        setTestResponse(responseText);
        setTestResult({ 
          success: true, 
          message: `✓ Success! Your ${llmProvider.toUpperCase()} provider supports multimodal inputs.` 
        });
      } else {
        throw new Error('No response received from LLM');
      }
    } catch (error) {
      console.error('Multimodal test failed:', error);
      setTestResult({ 
        success: false, 
        message: `Test failed: ${error.message}. This could mean multimodal is not supported or not configured correctly.` 
      });
    } finally {
      setTesting(false);
    }
  };

  const handleContinue = () => {
    const multimodalConfig = {
      imageSupport,
      audioSupport
    };

    // Save to setup data (will be applied to config when setup completes)
    updateSetupData({ multimodal: multimodalConfig });
    markStepComplete();
    nextStep();
  };

  return (
    <div className="setup-step space-y-3 sm:space-y-4">
      <div className="mb-2 sm:mb-3">
        <h2 className="text-xl sm:text-2xl font-bold mb-1 bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
          Multimodal
        </h2>
        <p className="text-xs sm:text-sm text-white/90">
          {usingChromeAI 
            ? 'Enable image/audio support'
            : `Multimodal for ${llmProvider.toUpperCase()}`
          }
        </p>
      </div>

      {/* Info for non-Chrome AI users */}
      {!usingChromeAI && (
        <div className="glass-container rounded-lg p-2 sm:p-3 border border-blue-500/30">
          <div className="flex items-start gap-2">
            <span className="text-lg sm:text-xl">ℹ️</span>
            <div className="min-w-0">
              <h3 className="text-xs sm:text-sm font-semibold text-blue-400 mb-1">Compatible Models</h3>
              <p className="text-[10px] sm:text-xs text-white/80">
                OpenAI: GPT-4o, GPT-4V • Ollama: llava, bakllava
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Feature Toggles */}
      <div className="space-y-2">
        {/* Image Support */}
        <div className="glass-container rounded-lg p-2 sm:p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="text-lg sm:text-xl">🖼️</span>
              <div className="min-w-0">
                <h3 className="text-xs sm:text-sm font-semibold text-white">Image Support</h3>
                <p className="text-[10px] sm:text-xs text-white/80 hidden sm:block">
                  Analyze images in chat
                </p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer ml-2">
              <input
                type="checkbox"
                checked={imageSupport}
                onChange={(e) => setImageSupport(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-white/20 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-purple-500 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600"></div>
            </label>
          </div>
        </div>

        {/* Audio Support */}
        <div className="glass-container rounded-lg p-2 sm:p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="text-lg sm:text-xl">🎤</span>
              <div className="min-w-0">
                <h3 className="text-xs sm:text-sm font-semibold text-white">Audio Support</h3>
                <p className="text-[10px] sm:text-xs text-white/80 hidden sm:block">
                  Analyze audio files in chat
                </p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer ml-2">
              <input
                type="checkbox"
                checked={audioSupport}
                onChange={(e) => setAudioSupport(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-white/20 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-purple-500 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600"></div>
            </label>
          </div>
        </div>
      </div>

      {/* Test Section (Collapsible) */}
      {(imageSupport || audioSupport) && (
        <div className="glass-container rounded-lg p-2 sm:p-3">
          <h3 className="text-xs sm:text-sm font-semibold text-white mb-2">Test (Optional)</h3>
          
          <div className="space-y-2">
            {/* File Inputs */}
            <div className="flex gap-2">
              {imageSupport && (
                <button
                  onClick={() => imageInputRef.current?.click()}
                  className="glass-button rounded px-2 py-1 text-[10px] sm:text-xs flex-1"
                >
                  {selectedImage ? `✓ ${selectedImage.name.substring(0, 15)}...` : '🖼️ Image'}
                </button>
              )}
              {audioSupport && (
                <button
                  onClick={() => audioInputRef.current?.click()}
                  className="glass-button rounded px-2 py-1 text-[10px] sm:text-xs flex-1"
                >
                  {selectedAudio ? `✓ ${selectedAudio.name.substring(0, 15)}...` : '🎤 Audio'}
                </button>
              )}
            </div>

            {/* Hidden file inputs */}
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageSelect}
              className="hidden"
            />
            <input
              ref={audioInputRef}
              type="file"
              accept="audio/*"
              onChange={handleAudioSelect}
              className="hidden"
            />

            {/* Prompt Input */}
            <input
              type="text"
              value={testPrompt}
              onChange={(e) => setTestPrompt(e.target.value)}
              placeholder="Describe this..."
              className="w-full px-2 py-1 text-xs bg-white/10 border border-white/20 rounded text-white placeholder-white/50 focus:outline-none focus:border-purple-400"
            />

            {/* Test Button */}
            <button
              onClick={testMultimodalSupport}
              disabled={testing || (!selectedImage && !selectedAudio)}
              className="glass-button rounded px-3 py-1.5 text-xs w-full disabled:opacity-50"
            >
              {testing ? '⏳ Testing...' : '🧪 Test'}
            </button>

            {/* Test Result */}
            {testResult && (
              <div className={`p-2 rounded border text-[10px] sm:text-xs ${
                testResult.success
                  ? 'bg-green-500/10 border-green-500/30 text-green-300'
                  : 'bg-red-500/10 border-red-500/30 text-red-300'
              }`}>
                {testResult.message}
              </div>
            )}

            {/* Response */}
            {testResponse && (
              <div className="p-2 bg-white/5 rounded text-[10px] sm:text-xs text-white/90 max-h-20 overflow-y-auto">
                {testResponse}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Continue Button */}
      <div className="flex justify-end pt-2">
        <button
          onClick={handleContinue}
          className="glass-button rounded-lg px-6 py-2 sm:px-8 sm:py-3 text-sm sm:text-base font-semibold"
        >
          Continue →
        </button>
      </div>


    </div>
  );
};

export default MultimodalFeaturesStep;

