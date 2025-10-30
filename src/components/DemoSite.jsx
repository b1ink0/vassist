/**
 * DemoSite Component
 * Modern landing page showcasing all Virtual Assistant features
 * Replaces the simple gradient background in dev mode
 */

import { useState } from 'react';
import { useApp } from '../contexts/AppContext';
import AIServiceProxy from '../services/proxies/AIServiceProxy';
import SummarizerServiceProxy from '../services/proxies/SummarizerServiceProxy';
import TranslatorServiceProxy from '../services/proxies/TranslatorServiceProxy';
import LanguageDetectorServiceProxy from '../services/proxies/LanguageDetectorServiceProxy';
import { TranslationLanguages } from '../config/aiConfig';

const DemoSite = () => {
  const [activeSection, setActiveSection] = useState('hero');
  const { openChat } = useApp();

  // Theme state: controls the overall page background (dark | light)
  const [pageTheme, setPageTheme] = useState('dark');
  
  // Editable demo text state
  const [improveText, setImproveText] = useState('hey can u help me with this thing? its kinda urgent and i need it done asap thx');
  const [writerPrompt, setWriterPrompt] = useState('Write a product review for wireless headphones');
  const [promptText, setPromptText] = useState('Explain quantum computing in simple terms');
  const [promptResponse, setPromptResponse] = useState('');
  const [isPromptLoading, setIsPromptLoading] = useState(false);
  
  // Summarizer state
  const [summarizeText, setSummarizeText] = useState('Artificial intelligence (AI) is transforming the way we live and work. From virtual assistants to self-driving cars, AI is becoming increasingly integrated into our daily lives. Machine learning algorithms can now recognize patterns, make predictions, and even create art. However, with great power comes great responsibility, and we must ensure AI is developed ethically and transparently.');
  const [summarizeType, setSummarizeType] = useState('tl;dr');
  const [summarizeResponse, setSummarizeResponse] = useState('');
  const [isSummarizeLoading, setIsSummarizeLoading] = useState(false);
  
  // Translator state
  const [translateText, setTranslateText] = useState('Hello! How are you doing today? I hope you are having a wonderful day.');
  const [targetLanguage, setTargetLanguage] = useState('es');
  const [translateResponse, setTranslateResponse] = useState('');
  const [isTranslateLoading, setIsTranslateLoading] = useState(false);
  
  // Language Detector state
  const [detectText, setDetectText] = useState('Bonjour! Comment allez-vous?');
  const [detectResponse, setDetectResponse] = useState('');
  const [isDetectLoading, setIsDetectLoading] = useState(false);
  
  const handleVoiceChatClick = () => {
    // Open chat first
    openChat();
    // Dispatch event to trigger voice mode after chat opens
    setTimeout(() => {
      const event = new CustomEvent('startVoiceMode');
      window.dispatchEvent(event);
    }, 300); // Wait for chat to be fully visible
  };

  const handlePromptSubmit = async () => {
    if (!promptText.trim() || isPromptLoading) return;
    
    setIsPromptLoading(true);
    setPromptResponse('');
    
    try {
      const messages = [{ role: 'user', content: promptText }];
      let fullResponse = '';
      
      await AIServiceProxy.sendMessage(messages, (chunk) => {
        fullResponse += chunk;
        setPromptResponse(fullResponse);
      });
      
    } catch (error) {
      setPromptResponse('Error: ' + (error.message || 'Failed to get response'));
    } finally {
      setIsPromptLoading(false);
    }
  };

  const handleSummarize = async () => {
    if (isSummarizeLoading || !summarizeText.trim()) return;
    
    setIsSummarizeLoading(true);
    setSummarizeResponse('');
    
    try {
      let fullSummary = '';
      const options = { type: summarizeType };
      const stream = await SummarizerServiceProxy.summarizeStreaming(summarizeText, options);
      
      for await (const chunk of stream) {
        fullSummary += chunk;
        setSummarizeResponse(fullSummary);
      }
    } catch (error) {
      setSummarizeResponse('Error: ' + (error.message || 'Failed to summarize'));
    } finally {
      setIsSummarizeLoading(false);
    }
  };

  const handleTranslate = async () => {
    if (isTranslateLoading || !translateText.trim()) return;
    
    setIsTranslateLoading(true);
    setTranslateResponse('');
    
    try {
      const result = await TranslatorServiceProxy.translate(translateText, 'en', targetLanguage);
      setTranslateResponse(result);
    } catch (error) {
      setTranslateResponse('Error: ' + (error.message || 'Failed to translate'));
    } finally {
      setIsTranslateLoading(false);
    }
  };

  const handleDetectLanguage = async () => {
    if (isDetectLoading || !detectText.trim()) return;
    
    setIsDetectLoading(true);
    setDetectResponse('');
    
    try {
      const results = await LanguageDetectorServiceProxy.detect(detectText);
      if (results && results.length > 0) {
        const topResult = results[0];
        // Find the language name from the code
        const languageInfo = TranslationLanguages.find(lang => lang.code === topResult.detectedLanguage);
        const languageName = languageInfo ? languageInfo.name : topResult.detectedLanguage;
        setDetectResponse(`Language: ${languageName} (${Math.round(topResult.confidence * 100)}% confidence)`);
      } else {
        setDetectResponse('Could not detect language');
      }
    } catch (error) {
      setDetectResponse('Error: ' + (error.message || 'Failed to detect language'));
    } finally {
      setIsDetectLoading(false);
    }
  };

  const isDark = pageTheme === 'dark';
  const theme = {
    textPrimary: isDark ? 'text-white' : 'text-slate-900',
    textMuted: isDark ? 'text-white/70' : 'text-slate-700',
    card: isDark ? 'bg-white/5 backdrop-blur-sm border border-white/10' : 'bg-white border border-slate-200',
    cardHover: isDark ? 'hover:bg-white/10 hover:border-white/20' : 'hover:bg-slate-50 hover:border-slate-300',
    badge: isDark ? 'bg-white/10 text-white/90 border border-white/20' : 'bg-slate-100 text-slate-900 border border-slate-200',
    subtleBg: isDark ? 'bg-black/20' : 'bg-slate-100',
    ctaGradient: isDark ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white' : 'bg-gradient-to-r from-purple-600 to-pink-600 text-white',
    // Demo tags
    purpleTag: isDark ? 'bg-purple-500/20 text-purple-300 border-purple-500/30' : 'bg-purple-100 text-purple-700 border-purple-300',
    blueTag: isDark ? 'bg-blue-500/20 text-blue-300 border-blue-500/30' : 'bg-blue-100 text-blue-700 border-blue-300',
    greenTag: isDark ? 'bg-green-500/20 text-green-300 border-green-500/30' : 'bg-green-100 text-green-700 border-green-300',
    orangeTag: isDark ? 'bg-orange-500/20 text-orange-300 border-orange-500/30' : 'bg-orange-100 text-orange-700 border-orange-300',
    indigoTag: isDark ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' : 'bg-indigo-100 text-indigo-700 border-indigo-300',
    pinkTag: isDark ? 'bg-pink-500/20 text-pink-300 border-pink-500/30' : 'bg-pink-100 text-pink-700 border-pink-300',
    tealTag: isDark ? 'bg-teal-500/20 text-teal-300 border-teal-500/30' : 'bg-teal-100 text-teal-700 border-teal-300',
  };

  const features = [
    {
      icon: '🤖',
      title: '3D Virtual Assistant',
      description: 'Interactive 3D character with realistic animations and emotions',
      color: 'from-purple-500 to-pink-500'
    },
    {
      icon: '💬',
      title: 'AI Chat',
      description: 'Intelligent conversation with context awareness and memory',
      color: 'from-blue-500 to-cyan-500'
    },
    {
      icon: '🎙️',
      title: 'Voice Interaction',
      description: 'Natural voice chat with speech-to-text and text-to-speech',
      color: 'from-green-500 to-emerald-500'
    },
    {
      icon: '🛠️',
      title: 'AI Toolbar',
      description: 'Smart text tools: summarize, translate, improve, dictionary, detect language, dictation, rewrite, and more',
      color: 'from-orange-500 to-red-500'
    },
    {
      icon: '🖼️',
      title: 'Image Analysis',
      description: 'Describe images, extract text, and identify objects',
      color: 'from-indigo-500 to-purple-500'
    },
    {
      icon: '⚡',
      title: 'Real-time Processing',
      description: 'Streaming responses with instant feedback',
      color: 'from-yellow-500 to-orange-500'
    },
  ];

  const handleScrollToSection = (section) => {
    const element = document.getElementById(section);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActiveSection(section);
    }
  };

  return (
    <div className={`absolute inset-0 overflow-auto custom-scrollbar transition-all duration-500 ${pageTheme === 'dark' ? 'bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900' : 'bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50'}`}>
      {/* Background decoration */}
      <div className={`fixed inset-0 opacity-40 ${isDark ? "bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0icmdiYSgyNTUsMjU1LDI1NSwwLjAzKSIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+')] " : "bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0icmdiYSgwLDAsMCwwLjAzKSIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+')]"}`}></div>
      
      {/* Fixed navigation */}
      <nav className={`fixed top-0 left-0 right-0 z-40 backdrop-blur-md border-b transition-all duration-500 ${pageTheme === 'dark' ? 'bg-slate-900/80 border-white/10' : 'bg-white/80 border-slate-200'}`}>
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3 sm:py-4 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <span className="text-xl sm:text-2xl">🤖</span>
            </div>
            <div>
              <h1 className={`text-base sm:text-xl font-bold ${theme.textPrimary}`}>Virtual Assistant</h1>
              <p className={`text-[10px] sm:text-xs ${pageTheme === 'dark' ? 'text-purple-300' : 'text-purple-600'}`}>AI-Powered Companion</p>
            </div>
          </div>
          
          <div className="hidden md:flex items-center gap-8 lg:gap-12">
            <button 
              onClick={() => handleScrollToSection('hero')}
              className={`text-sm font-medium transition-colors ${activeSection === 'hero' ? (isDark ? 'text-purple-400' : 'text-purple-600') : (isDark ? 'text-white/70 hover:text-white' : 'text-slate-600 hover:text-slate-900')}`}
            >
              Home
            </button>
            <button 
              onClick={() => handleScrollToSection('features')}
              className={`text-sm font-medium transition-colors ${activeSection === 'features' ? (isDark ? 'text-purple-400' : 'text-purple-600') : (isDark ? 'text-white/70 hover:text-white' : 'text-slate-600 hover:text-slate-900')}`}
            >
              Features
            </button>
            <button 
              onClick={() => handleScrollToSection('demos')}
              className={`text-sm font-medium transition-colors ${activeSection === 'demos' ? (isDark ? 'text-purple-400' : 'text-purple-600') : (isDark ? 'text-white/70 hover:text-white' : 'text-slate-600 hover:text-slate-900')}`}
            >
              Try It
            </button>
            <button 
              onClick={() => handleScrollToSection('how-it-works')}
              className={`text-sm font-medium transition-colors ${activeSection === 'how-it-works' ? (isDark ? 'text-purple-400' : 'text-purple-600') : (isDark ? 'text-white/70 hover:text-white' : 'text-slate-600 hover:text-slate-900')}`}
            >
              How It Works
            </button>
          </div>
          
          {/* Theme controls */}
          <div className="flex items-center gap-2 sm:gap-3">
            <div className={`inline-flex rounded-md p-0.5 sm:p-1 border transition-all ${isDark ? 'bg-white/5 border-white/10' : 'bg-slate-100 border-slate-200'}`}>
              <button
                onClick={() => setPageTheme('dark')}
                className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all ${isDark ? (pageTheme === 'dark' ? 'bg-white/10 text-white' : 'bg-slate-200 text-slate-900') : 'text-slate-600 hover:text-slate-900'}`}
              >
                <span className="hidden sm:inline">🌙 Dark</span>
                <span className="sm:hidden">🌙</span>
              </button>
              <button
                onClick={() => setPageTheme('light')}
                className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all ${!isDark ? (pageTheme === 'light' ? 'bg-slate-200 text-slate-900' : 'text-slate-600 hover:text-slate-900') : 'text-white/70 hover:text-white'}`}
              >
                <span className="hidden sm:inline">☀️ Light</span>
                <span className="sm:hidden">☀️</span>
              </button>
            </div>

            <button 
              onClick={() => openChat?.()}
              className={`px-3 sm:px-6 py-1.5 sm:py-2.5 rounded-lg text-xs sm:text-base font-medium ${isDark ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:from-purple-600 hover:to-pink-600 hover:shadow-lg hover:shadow-purple-500/50' : 'bg-slate-900/10 text-slate-900 border border-slate-200 hover:bg-slate-200'}`}
            >
              <span className="hidden sm:inline">Start Chat</span>
              <span className="sm:hidden">💬</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section id="hero" className="relative min-h-screen flex items-center justify-center px-3 sm:px-6 pt-20 sm:pt-24 pb-12 sm:pb-20">
        <div className="max-w-6xl mx-auto text-center space-y-6 sm:space-y-8 relative z-10">
          {/* Animated gradient orb */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] sm:w-[500px] h-[300px] sm:h-[500px] bg-gradient-to-r from-purple-500/30 to-pink-500/30 rounded-full blur-3xl animate-pulse"></div>
          
          <div className="relative">
            <h1 className={`text-4xl sm:text-6xl md:text-8xl font-bold mb-4 sm:mb-6 leading-tight ${isDark ? 'bg-gradient-to-r from-white via-purple-200 to-pink-200 bg-clip-text text-transparent' : 'bg-gradient-to-r from-slate-900 via-purple-600 to-pink-600 bg-clip-text text-transparent'}`}>
              Meet Your New
              <br />
              AI Companion
            </h1>
            
            <p className={`text-base sm:text-xl md:text-2xl ${theme.textMuted} max-w-3xl mx-auto mb-6 sm:mb-8 leading-relaxed px-2`}>
              An intelligent virtual assistant that understands, converses, and helps you with any task. 
              <span className={`${isDark ? 'text-purple-300' : 'text-purple-600'} font-semibold`}> Powered by on-device AI in your browser.</span>
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 mb-8 sm:mb-12 px-2">
              <button 
                onClick={() => openChat?.()}
                className={`w-full sm:w-auto group px-6 sm:px-8 py-3 sm:py-4 ${theme.ctaGradient} rounded-xl font-semibold text-base sm:text-lg hover:scale-105 hover:shadow-2xl flex items-center justify-center gap-2`}
              >
                <span>Try It Now</span>
                <span className="group-hover:translate-x-1 transition-transform">→</span>
              </button>
              
              <button 
                onClick={() => handleScrollToSection('demos')}
                className={`w-full sm:w-auto px-6 sm:px-8 py-3 sm:py-4 rounded-xl font-semibold text-base sm:text-lg transition-all border ${isDark ? 'bg-white/10 backdrop-blur-sm text-white border-white/20 hover:bg-white/20' : 'bg-slate-100 text-slate-900 border-slate-200 hover:bg-slate-200'} flex items-center justify-center gap-2`}
              >
                <span>View Demos</span>
                <span className="text-xl">↓</span>
              </button>
            </div>
            
            {/* Feature badges */}
            <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 text-xs sm:text-sm px-2">
              <span className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-full ${theme.badge}`}>
                🎯 Smart AI Chat
              </span>
              <span className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-full ${theme.badge}`}>
                🎙️ Voice Interaction
              </span>
              <span className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-full ${theme.badge}`}>
                🛠️ AI Toolbar
              </span>
              <span className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-full ${theme.badge}`}>
                🖼️ Image Analysis
              </span>
            </div>
          </div>
        </div>
        
        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
          <div className="w-6 h-10 border-2 border-white/30 rounded-full flex items-start justify-center p-2">
            <div className="w-1.5 h-3 bg-white/50 rounded-full"></div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="relative py-16 sm:py-24 px-3 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12 sm:mb-16">
            <h2 className={`text-3xl sm:text-5xl font-bold ${theme.textPrimary} mb-3 sm:mb-4`}>Powerful Features</h2>
            <p className={`text-base sm:text-xl ${theme.textMuted}`}>Everything you need in one intelligent assistant</p>
          </div>
          
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {features.map((feature, index) => (
              <div 
                key={index}
                className={`group relative p-6 sm:p-8 ${theme.card} rounded-2xl ${theme.cardHover} transition-all hover:scale-105 hover:shadow-2xl`}
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div className={`w-12 h-12 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br ${feature.color} flex items-center justify-center text-2xl sm:text-3xl mb-3 sm:mb-4 group-hover:scale-110 transition-transform`}>
                  {feature.icon}
                </div>
                <h3 className={`text-xl sm:text-2xl font-bold ${theme.textPrimary} mb-2 sm:mb-3`}>{feature.title}</h3>
                <p className={`${theme.textMuted} leading-relaxed text-sm sm:text-base`}>{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Interactive Demos Section */}
      <section id="demos" className="relative py-16 sm:py-24 px-3 sm:px-6 bg-gradient-to-b from-transparent via-purple-900/20 to-transparent">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12 sm:mb-16">
            <h2 className={`text-3xl sm:text-5xl font-bold ${theme.textPrimary} mb-3 sm:mb-4`}>Try Chrome AI APIs</h2>
            <p className={`text-base sm:text-xl ${theme.textMuted} px-2`}>Experience on-device AI powered by Gemini Nano!</p>
          </div>
          
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
            {/* Summarize Demo */}
            <div className={`p-6 sm:p-8 ${theme.card} rounded-2xl ${theme.cardHover}`}>
              <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                <span className="text-2xl sm:text-3xl">📝</span>
                <h3 className={`text-xl sm:text-2xl font-bold ${theme.textPrimary}`}>Summarizer</h3>
              </div>
              <p className={`${theme.textMuted} mb-3 sm:mb-4 text-xs sm:text-sm`}>Edit text and select summary type:</p>
              
              <textarea
                value={summarizeText}
                onChange={(e) => setSummarizeText(e.target.value)}
                className={`${theme.subtleBg} p-3 sm:p-4 rounded-lg w-full ${isDark ? 'text-white/90' : 'text-slate-900'} leading-relaxed text-xs sm:text-sm resize-none focus:outline-none focus:ring-2 ${isDark ? 'focus:ring-purple-500' : 'focus:ring-purple-400'} transition-all mb-3 custom-scrollbar`}
                rows={4}
                placeholder="Enter text to summarize..."
              />
              
              <div className="flex gap-2 flex-wrap mb-3">
                <button
                  onClick={() => setSummarizeType('tl;dr')}
                  className={`px-3 py-1.5 rounded-lg text-xs border transition-all ${
                    summarizeType === 'tl;dr'
                      ? `${theme.purpleTag} ring-2 ${isDark ? 'ring-purple-400' : 'ring-purple-500'}`
                      : `${isDark ? 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10' : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'}`
                  }`}
                >
                  TL;DR
                </button>
                <button
                  onClick={() => setSummarizeType('key-points')}
                  className={`px-3 py-1.5 rounded-lg text-xs border transition-all ${
                    summarizeType === 'key-points'
                      ? `${theme.purpleTag} ring-2 ${isDark ? 'ring-purple-400' : 'ring-purple-500'}`
                      : `${isDark ? 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10' : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'}`
                  }`}
                >
                  Key Points
                </button>
                <button
                  onClick={() => setSummarizeType('headline')}
                  className={`px-3 py-1.5 rounded-lg text-xs border transition-all ${
                    summarizeType === 'headline'
                      ? `${theme.purpleTag} ring-2 ${isDark ? 'ring-purple-400' : 'ring-purple-500'}`
                      : `${isDark ? 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10' : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'}`
                  }`}
                >
                  Headline
                </button>
              </div>
              
              <button
                onClick={handleSummarize}
                disabled={isSummarizeLoading || !summarizeText.trim()}
                className={`w-full px-4 py-2 rounded-lg font-semibold text-xs sm:text-sm transition-all mb-3 ${
                  isSummarizeLoading || !summarizeText.trim()
                    ? (isDark ? 'bg-white/5 text-white/30' : 'bg-slate-100 text-slate-300')
                    : `${theme.ctaGradient} hover:scale-105`
                }`}
              >
                {isSummarizeLoading ? 'Summarizing...' : 'Summarize'}
              </button>
              
              {(summarizeResponse || isSummarizeLoading) && (
                <div className={`${theme.subtleBg} p-3 sm:p-4 rounded-lg min-h-[60px]`}>
                  <p className={`text-xs sm:text-sm ${isDark ? 'text-white/90' : 'text-slate-900'} whitespace-pre-wrap`}>
                    {isSummarizeLoading && !summarizeResponse ? 'Processing...' : summarizeResponse}
                  </p>
                </div>
              )}
            </div>

            {/* Translate Demo */}
            <div className={`p-6 sm:p-8 ${theme.card} rounded-2xl ${theme.cardHover}`}>
              <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                <span className="text-2xl sm:text-3xl">🌍</span>
                <h3 className={`text-xl sm:text-2xl font-bold ${theme.textPrimary}`}>Translator</h3>
              </div>
              <p className={`${theme.textMuted} mb-3 sm:mb-4 text-xs sm:text-sm`}>Edit text and select target language:</p>
              
              <textarea
                value={translateText}
                onChange={(e) => setTranslateText(e.target.value)}
                className={`${theme.subtleBg} p-3 sm:p-4 rounded-lg w-full ${isDark ? 'text-white/90' : 'text-slate-900'} leading-relaxed text-xs sm:text-sm resize-none focus:outline-none focus:ring-2 ${isDark ? 'focus:ring-purple-500' : 'focus:ring-purple-400'} transition-all mb-3 custom-scrollbar`}
                rows={3}
                placeholder="Enter text to translate..."
              />
              
              <div className="flex gap-2 flex-wrap mb-3">
                <button
                  onClick={() => setTargetLanguage('es')}
                  className={`px-3 py-1.5 rounded-lg text-xs border transition-all ${
                    targetLanguage === 'es'
                      ? `${theme.blueTag} ring-2 ${isDark ? 'ring-blue-400' : 'ring-blue-500'}`
                      : `${isDark ? 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10' : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'}`
                  }`}
                >
                  Spanish
                </button>
                <button
                  onClick={() => setTargetLanguage('fr')}
                  className={`px-3 py-1.5 rounded-lg text-xs border transition-all ${
                    targetLanguage === 'fr'
                      ? `${theme.blueTag} ring-2 ${isDark ? 'ring-blue-400' : 'ring-blue-500'}`
                      : `${isDark ? 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10' : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'}`
                  }`}
                >
                  French
                </button>
                <button
                  onClick={() => setTargetLanguage('ja')}
                  className={`px-3 py-1.5 rounded-lg text-xs border transition-all ${
                    targetLanguage === 'ja'
                      ? `${theme.blueTag} ring-2 ${isDark ? 'ring-blue-400' : 'ring-blue-500'}`
                      : `${isDark ? 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10' : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'}`
                  }`}
                >
                  Japanese
                </button>
                <button
                  onClick={() => setTargetLanguage('de')}
                  className={`px-3 py-1.5 rounded-lg text-xs border transition-all ${
                    targetLanguage === 'de'
                      ? `${theme.blueTag} ring-2 ${isDark ? 'ring-blue-400' : 'ring-blue-500'}`
                      : `${isDark ? 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10' : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'}`
                  }`}
                >
                  German
                </button>
              </div>
              
              <button
                onClick={handleTranslate}
                disabled={isTranslateLoading || !translateText.trim()}
                className={`w-full px-4 py-2 rounded-lg font-semibold text-xs sm:text-sm transition-all mb-3 ${
                  isTranslateLoading || !translateText.trim()
                    ? (isDark ? 'bg-white/5 text-white/30' : 'bg-slate-100 text-slate-300')
                    : `${theme.ctaGradient} hover:scale-105`
                }`}
              >
                {isTranslateLoading ? 'Translating...' : 'Translate'}
              </button>
              
              {(translateResponse || isTranslateLoading) && (
                <div className={`${theme.subtleBg} p-3 sm:p-4 rounded-lg min-h-[60px]`}>
                  <p className={`text-xs sm:text-sm ${isDark ? 'text-white/90' : 'text-slate-900'} whitespace-pre-wrap`}>
                    {isTranslateLoading && !translateResponse ? 'Translating...' : translateResponse}
                  </p>
                </div>
              )}
            </div>

            {/* Dictionary Demo */}
            <div className={`p-6 sm:p-8 ${theme.card} rounded-2xl ${theme.cardHover}`}>
              <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                <span className="text-2xl sm:text-3xl">📖</span>
                <h3 className={`text-xl sm:text-2xl font-bold ${theme.textPrimary}`}>Language Detector</h3>
              </div>
              <p className={`${theme.textMuted} mb-3 sm:mb-4 text-xs sm:text-sm`}>Edit text to detect its language:</p>
              
              <textarea
                value={detectText}
                onChange={(e) => setDetectText(e.target.value)}
                className={`${theme.subtleBg} p-3 sm:p-4 rounded-lg w-full ${isDark ? 'text-white/90' : 'text-slate-900'} leading-relaxed text-xs sm:text-sm resize-none focus:outline-none focus:ring-2 ${isDark ? 'focus:ring-purple-500' : 'focus:ring-purple-400'} transition-all mb-3 custom-scrollbar`}
                rows={3}
                placeholder="Enter text in any language..."
              />
              
              <button
                onClick={handleDetectLanguage}
                disabled={isDetectLoading || !detectText.trim()}
                className={`w-full px-4 py-2 rounded-lg font-semibold text-xs sm:text-sm transition-all mb-3 ${
                  isDetectLoading || !detectText.trim()
                    ? (isDark ? 'bg-white/5 text-white/30' : 'bg-slate-100 text-slate-300')
                    : `${theme.ctaGradient} hover:scale-105`
                }`}
              >
                {isDetectLoading ? 'Detecting...' : 'Detect Language'}
              </button>
              
              {(detectResponse || isDetectLoading) && (
                <div className={`${theme.subtleBg} p-3 sm:p-4 rounded-lg mb-3 min-h-[60px]`}>
                  <p className={`text-xs sm:text-sm ${isDark ? 'text-white/90' : 'text-slate-900'} whitespace-pre-wrap`}>
                    {isDetectLoading && !detectResponse ? 'Detecting...' : detectResponse}
                  </p>
                </div>
              )}
              
              <div className="flex gap-2 flex-wrap">
                <span className={`px-3 py-1.5 rounded-lg text-xs border ${theme.greenTag}`}>
                  Auto Detect
                </span>
                <span className={`px-3 py-1.5 rounded-lg text-xs border ${theme.greenTag}`}>
                  Confidence Score
                </span>
                <span className={`px-3 py-1.5 rounded-lg text-xs border ${theme.greenTag}`}>
                  Multi-language
                </span>
              </div>
            </div>

            {/* Rewriter Demo */}
            <div className={`p-6 sm:p-8 ${theme.card} rounded-2xl ${theme.cardHover}`}>
              <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                <span className="text-2xl sm:text-3xl">✨</span>
                <h3 className={`text-xl sm:text-2xl font-bold ${theme.textPrimary}`}>Rewriter</h3>
              </div>
              <p className={`${theme.textMuted} mb-3 sm:mb-4 text-xs sm:text-sm`}>Type or edit the text below to rewrite it:</p>
              <textarea
                value={improveText}
                onChange={(e) => setImproveText(e.target.value)}
                className={`${theme.subtleBg} p-3 sm:p-4 rounded-lg w-full ${isDark ? 'text-white/90' : 'text-slate-900'} leading-relaxed text-xs sm:text-sm resize-none focus:outline-none focus:ring-2 ${isDark ? 'focus:ring-purple-500' : 'focus:ring-purple-400'} transition-all custom-scrollbar`}
                rows={3}
                placeholder="Type something to rewrite..."
              />
              <div className="mt-3 sm:mt-4 flex gap-2 flex-wrap">
                <span className={`px-3 py-1.5 rounded-lg text-xs border ${theme.orangeTag}`}>
                  More Formal
                </span>
                <span className={`px-3 py-1.5 rounded-lg text-xs border ${theme.orangeTag}`}>
                  More Casual
                </span>
                <span className={`px-3 py-1.5 rounded-lg text-xs border ${theme.orangeTag}`}>
                  Shorter
                </span>
                <span className={`px-3 py-1.5 rounded-lg text-xs border ${theme.orangeTag}`}>
                  Longer
                </span>
              </div>
            </div>

            {/* Writer Demo */}
            <div className={`p-6 sm:p-8 ${theme.card} rounded-2xl ${theme.cardHover}`}>
              <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                <span className="text-2xl sm:text-3xl">✍️</span>
                <h3 className={`text-xl sm:text-2xl font-bold ${theme.textPrimary}`}>Writer</h3>
              </div>
              <p className={`${theme.textMuted} mb-3 sm:mb-4 text-xs sm:text-sm`}>Enter a prompt to generate content:</p>
              <textarea
                value={writerPrompt}
                onChange={(e) => setWriterPrompt(e.target.value)}
                className={`${theme.subtleBg} p-3 sm:p-4 rounded-lg w-full ${isDark ? 'text-white/90' : 'text-slate-900'} leading-relaxed text-xs sm:text-sm resize-none focus:outline-none focus:ring-2 ${isDark ? 'focus:ring-purple-500' : 'focus:ring-purple-400'} transition-all custom-scrollbar`}
                rows={3}
                placeholder="Write a prompt for content generation..."
              />
              <div className="mt-3 sm:mt-4 flex gap-2 flex-wrap">
                <span className={`px-3 py-1.5 rounded-lg text-xs border ${theme.pinkTag}`}>
                  Casual Tone
                </span>
                <span className={`px-3 py-1.5 rounded-lg text-xs border ${theme.pinkTag}`}>
                  Formal Tone
                </span>
                <span className={`px-3 py-1.5 rounded-lg text-xs border ${theme.pinkTag}`}>
                  Short Length
                </span>
                <span className={`px-3 py-1.5 rounded-lg text-xs border ${theme.pinkTag}`}>
                  Long Length
                </span>
              </div>
            </div>

            {/* Prompt API Demo */}
            <div className={`p-6 sm:p-8 ${theme.card} rounded-2xl ${theme.cardHover}`}>
              <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                <span className="text-2xl sm:text-3xl">🤖</span>
                <h3 className={`text-xl sm:text-2xl font-bold ${theme.textPrimary}`}>Prompt API</h3>
              </div>
              <p className={`${theme.textMuted} mb-3 sm:mb-4 text-xs sm:text-sm`}>Ask anything - custom AI prompting:</p>
              
              {/* Input Area */}
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={promptText}
                  onChange={(e) => setPromptText(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handlePromptSubmit()}
                  className={`${theme.subtleBg} p-3 sm:p-4 rounded-lg flex-1 ${isDark ? 'text-white/90' : 'text-slate-900'} text-xs sm:text-sm focus:outline-none focus:ring-2 ${isDark ? 'focus:ring-purple-500' : 'focus:ring-purple-400'} transition-all`}
                  placeholder="Ask the AI anything..."
                  disabled={isPromptLoading}
                />
                <button
                  onClick={handlePromptSubmit}
                  disabled={isPromptLoading || !promptText.trim()}
                  className={`px-4 sm:px-6 py-3 rounded-lg font-semibold text-xs sm:text-sm transition-all ${
                    isPromptLoading || !promptText.trim() 
                      ? (isDark ? 'bg-white/5 text-white/30' : 'bg-slate-100 text-slate-300')
                      : `${theme.ctaGradient} hover:scale-105`
                  }`}
                >
                  {isPromptLoading ? '...' : 'Send'}
                </button>
              </div>
              
              {/* Response Area */}
              {(promptResponse || isPromptLoading) && (
                <div className={`${theme.subtleBg} p-3 sm:p-4 rounded-lg mb-3 min-h-[80px]`}>
                  <p className={`text-xs sm:text-sm ${isDark ? 'text-white/90' : 'text-slate-900'} whitespace-pre-wrap`}>
                    {isPromptLoading && !promptResponse ? 'Thinking...' : promptResponse}
                  </p>
                </div>
              )}
              
              <div className="flex gap-2 flex-wrap">
                <span className={`px-3 py-1.5 rounded-lg text-xs border ${theme.tealTag}`}>
                  Custom Prompts
                </span>
                <span className={`px-3 py-1.5 rounded-lg text-xs border ${theme.tealTag}`}>
                  Streaming
                </span>
                <span className={`px-3 py-1.5 rounded-lg text-xs border ${theme.tealTag}`}>
                  Context Aware
                </span>
                <span className={`px-3 py-1.5 rounded-lg text-xs border ${theme.tealTag}`}>
                  Multi-turn
                </span>
              </div>
            </div>

            {/* Dictionary Demo */}
            <div className={`p-6 sm:p-8 ${theme.card} rounded-2xl ${theme.cardHover}`}>
              <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                <span className="text-2xl sm:text-3xl">📚</span>
                <h3 className={`text-xl sm:text-2xl font-bold ${theme.textPrimary}`}>Dictionary</h3>
              </div>
              <p className={`${theme.textMuted} mb-3 sm:mb-4 text-xs sm:text-sm`}>Look up word definitions:</p>
              
              <div className={`${theme.subtleBg} p-3 sm:p-4 rounded-lg mb-3 text-center`}>
                <p className={`text-base sm:text-lg font-semibold ${isDark ? 'text-purple-300' : 'text-purple-600'} mb-2`}>serendipity</p>
                <p className={`text-xs sm:text-sm ${isDark ? 'text-white/70 italic' : 'text-slate-600 italic'} mb-2`}>noun</p>
                <p className={`text-xs sm:text-sm ${isDark ? 'text-white/90' : 'text-slate-900'}`}>
                  The occurrence of events by chance in a happy or beneficial way.
                </p>
              </div>
              
              <div className="flex gap-2 flex-wrap">
                <span className={`px-3 py-1.5 rounded-lg text-xs border ${theme.indigoTag}`}>
                  Definitions
                </span>
                <span className={`px-3 py-1.5 rounded-lg text-xs border ${theme.indigoTag}`}>
                  Synonyms
                </span>
                <span className={`px-3 py-1.5 rounded-lg text-xs border ${theme.indigoTag}`}>
                  Examples
                </span>
              </div>
            </div>

            {/* Dictation Demo */}
            <div className={`p-6 sm:p-8 ${theme.card} rounded-2xl ${theme.cardHover}`}>
              <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                <span className="text-2xl sm:text-3xl">🎤</span>
                <h3 className={`text-xl sm:text-2xl font-bold ${theme.textPrimary}`}>Dictation</h3>
              </div>
              <p className={`${theme.textMuted} mb-3 sm:mb-4 text-xs sm:text-sm`}>Voice to text - speak and type:</p>
              
              <div className={`${theme.subtleBg} p-3 sm:p-4 rounded-lg mb-3 text-center`}>
                <div className="flex items-center justify-center gap-3 mb-3">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center ${theme.ctaGradient}`}>
                    <span className="text-2xl">🎙️</span>
                  </div>
                </div>
                <p className={`text-xs sm:text-sm ${isDark ? 'text-white/90' : 'text-slate-900'} mb-2`}>
                  Click microphone to start recording
                </p>
                <p className={`text-xs ${isDark ? 'text-white/60' : 'text-slate-500'}`}>
                  Your speech will be converted to text instantly
                </p>
              </div>
              
              <div className="flex gap-2 flex-wrap">
                <span className={`px-3 py-1.5 rounded-lg text-xs border ${theme.greenTag}`}>
                  Real-time
                </span>
                <span className={`px-3 py-1.5 rounded-lg text-xs border ${theme.greenTag}`}>
                  Auto-insert
                </span>
                <span className={`px-3 py-1.5 rounded-lg text-xs border ${theme.greenTag}`}>
                  Hands-free
                </span>
              </div>
            </div>
          </div>

          {/* Image Demo */}
          <div className={`mt-8 p-8 ${theme.card} rounded-2xl`}>
            <div className="flex items-center gap-3 mb-4">
              <span className="text-3xl">🖼️</span>
              <h3 className={`text-2xl font-bold ${theme.textPrimary}`}>Image Analysis</h3>
            </div>
            <p className={`${theme.textMuted} mb-6 text-sm`}>Hover over these images to see the AI toolbar:</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="aspect-square rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-6xl cursor-pointer hover:scale-105 transition-transform">
                🌅
              </div>
              <div className="aspect-square rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-6xl cursor-pointer hover:scale-105 transition-transform">
                🏔️
              </div>
              <div className="aspect-square rounded-lg bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center text-6xl cursor-pointer hover:scale-105 transition-transform">
                🌺
              </div>
              <div className="aspect-square rounded-lg bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center text-6xl cursor-pointer hover:scale-105 transition-transform">
                🦋
              </div>
            </div>
            <div className="mt-4 flex gap-2 flex-wrap">
              <span className={`px-3 py-1.5 rounded-lg text-xs border ${theme.indigoTag}`}>
                Describe Image
              </span>
              <span className={`px-3 py-1.5 rounded-lg text-xs border ${theme.indigoTag}`}>
                Extract Text (OCR)
              </span>
              <span className={`px-3 py-1.5 rounded-lg text-xs border ${theme.indigoTag}`}>
                Identify Objects
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Theme Demo: light background showcase */}
      <section id="theme-demo" className="relative py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-8">
            <h2 className={`text-4xl font-bold mb-4 ${pageTheme === 'dark' ? 'text-white' : 'text-slate-900'}`}>Theme Switching Demo</h2>
            <p className={`text-lg ${pageTheme === 'dark' ? 'text-white/70' : 'text-slate-700'}`}>
              Use the theme toggle in the navigation bar to switch between dark and light modes. 
              See how the Virtual Assistant adapts to different backgrounds!
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div className={`${pageTheme === 'light' ? 'bg-white text-slate-900 border-2 border-slate-300' : 'bg-slate-900 text-white border-2 border-white/20'} p-8 rounded-2xl shadow-2xl transition-all duration-500`}> 
              <div className="flex items-center gap-4 mb-4">
                <div className={`w-12 h-12 rounded-lg ${pageTheme === 'light' ? 'bg-gradient-to-br from-blue-500 to-cyan-500' : 'bg-gradient-to-br from-purple-500 to-pink-500'} flex items-center justify-center text-2xl`}>🤖</div>
                <div>
                  <h3 className={`text-2xl font-bold ${pageTheme === 'light' ? 'text-slate-900' : 'text-white'}`}>Virtual Assistant</h3>
                  <p className={`text-sm ${pageTheme === 'light' ? 'text-slate-700' : 'text-white/70'}`}>Currently in {pageTheme} mode</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className={`${pageTheme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-white/5 border-white/10'} p-4 rounded-lg border`}>
                  <p className={`${pageTheme === 'light' ? 'text-slate-800' : 'text-white/80'}`}>
                    Hello! Click the theme toggle buttons in the top navigation to see how the entire demo site changes. 
                    The extension automatically detects your website's background color and adjusts accordingly!
                  </p>
                </div>

                <div className="flex gap-2">
                  <button 
                    onClick={() => setPageTheme('dark')} 
                    className={`px-4 py-2 rounded-md font-medium transition-all ${pageTheme === 'dark' ? 'bg-purple-600 text-white scale-105' : (pageTheme === 'light' ? 'bg-slate-200 text-slate-700 hover:bg-slate-300' : 'bg-white/5 text-white hover:bg-white/10')}`}
                  >
                    🌙 Dark
                  </button>
                  <button 
                    onClick={() => setPageTheme('light')} 
                    className={`px-4 py-2 rounded-md font-medium transition-all ${pageTheme === 'light' ? 'bg-blue-600 text-white scale-105' : (pageTheme === 'dark' ? 'bg-white/5 text-white hover:bg-white/10' : 'bg-slate-200 text-slate-700')}`}
                  >
                    ☀️ Light
                  </button>
                </div>
              </div>
            </div>

            <div>
              <div className={`p-8 rounded-2xl transition-all duration-500 ${pageTheme === 'dark' ? 'bg-white/5 border border-white/10 text-white' : 'bg-white shadow-lg border border-slate-200 text-slate-900'}`}>
                <h4 className={`text-xl font-bold mb-3 ${pageTheme === 'light' ? 'text-slate-900' : 'text-white'}`}>How Auto-Detection Works</h4>
                <p className={`text-sm mb-4 ${pageTheme === 'light' ? 'text-slate-700' : 'text-white/70'}`}>
                  The Virtual Assistant extension intelligently adapts to any website's color scheme:
                </p>
                <ul className={`text-sm space-y-2 ${pageTheme === 'light' ? 'text-slate-700' : 'text-white/70'}`}>
                  <li className="flex items-start gap-2">
                    <span className="text-lg">✓</span>
                    <span>Automatically detects light vs dark backgrounds</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-lg">✓</span>
                    <span>Adjusts text colors for optimal contrast</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-lg">✓</span>
                    <span>Changes UI elements to match the site's theme</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-lg">✓</span>
                    <span>Works seamlessly on any website</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="relative py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className={`text-5xl font-bold ${theme.textPrimary} mb-4`}>How AI Toolbar Works</h2>
            <p className={`text-xl ${theme.textMuted}`}>Select text anywhere on any website and unleash AI powers</p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center space-y-4">
              <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-3xl font-bold text-white">
                1
              </div>
              <h3 className={`text-2xl font-bold ${theme.textPrimary}`}>Select Text or Image</h3>
              <p className={`${theme.textMuted}`}>Highlight any text or hover over an image to activate the AI toolbar instantly</p>
            </div>
            
            <div className="text-center space-y-4">
              <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-3xl font-bold text-white">
                2
              </div>
              <h3 className={`text-2xl font-bold ${theme.textPrimary}`}>Choose AI Action</h3>
              <p className={`${theme.textMuted}`}>Pick from summarize, translate, improve, dictionary, detect language, rewrite, or analyze image</p>
            </div>
            
            <div className="text-center space-y-4">
              <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center text-3xl font-bold text-white">
                3
              </div>
              <h3 className={`text-2xl font-bold ${theme.textPrimary}`}>Get Instant AI Results</h3>
              <p className={`${theme.textMuted}`}>Watch as AI processes your request in real-time with streaming responses - all on your device!</p>
            </div>
          </div>

          {/* Chat Demo Call-to-Action */}
          <div className={`mt-16 p-12 rounded-3xl border text-center transition-all duration-300 ${isDark ? 'bg-gradient-to-r from-purple-500/20 to-pink-500/20 border-white/20' : 'bg-white shadow-sm border-slate-200'}`}>
            <h3 className={`text-4xl font-bold mb-4 ${theme.textPrimary}`}>Want to Chat?</h3>
            <p className={`text-xl mb-8 max-w-2xl mx-auto ${isDark ? 'text-white/80' : 'text-slate-700'}`}>
              Click the chat button at the bottom right to have a conversation with your virtual assistant. 
              Ask questions, get help, or just chat - with full history saved!
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button 
                onClick={() => openChat?.()}
                className={`px-8 py-4 rounded-xl font-semibold text-lg transition-all ${theme.ctaGradient} hover:scale-105 hover:shadow-2xl`}
              >
                💬 Start Conversation
              </button>
              <button 
                onClick={handleVoiceChatClick}
                className={`px-8 py-4 rounded-xl font-semibold text-lg transition-all ${isDark ? 'bg-white/10 text-white border border-white/20 hover:bg-white/20' : 'bg-slate-100 text-slate-900 border border-slate-200 hover:bg-slate-200'}`}
              >
                🎙️ Try Voice Chat
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Use Cases Section */}
      <section className="relative py-24 px-6 bg-gradient-to-b from-transparent via-purple-900/20 to-transparent">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className={`text-5xl font-bold ${theme.textPrimary} mb-4`}>Perfect For</h2>
            <p className={`text-xl ${theme.textMuted}`}>See how people use Virtual Assistant</p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className={`p-6 ${theme.card} rounded-2xl ${theme.cardHover} text-center`}>
              <div className="text-4xl mb-3">👨‍💻</div>
              <h4 className={`text-xl font-bold ${theme.textPrimary} mb-2`}>Developers</h4>
              <p className={`${theme.textMuted} text-sm`}>Code review, documentation, debugging assistance</p>
            </div>
            
            <div className={`p-6 ${theme.card} rounded-2xl ${theme.cardHover} text-center`}>
              <div className="text-4xl mb-3">✍️</div>
              <h4 className={`text-xl font-bold ${theme.textPrimary} mb-2`}>Writers</h4>
              <p className={`${theme.textMuted} text-sm`}>Grammar checking, style improvement, translations</p>
            </div>
            
            <div className={`p-6 ${theme.card} rounded-2xl ${theme.cardHover} text-center`}>
              <div className="text-4xl mb-3">🎓</div>
              <h4 className={`text-xl font-bold ${theme.textPrimary} mb-2`}>Students</h4>
              <p className={`${theme.textMuted} text-sm`}>Research summarization, language learning, study help</p>
            </div>
            
            <div className={`p-6 ${theme.card} rounded-2xl ${theme.cardHover} text-center`}>
              <div className="text-4xl mb-3">💼</div>
              <h4 className={`text-xl font-bold ${theme.textPrimary} mb-2`}>Professionals</h4>
              <p className={`${theme.textMuted} text-sm`}>Email polishing, report summarization, quick answers</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative py-12 px-6 border-t border-white/10">
        <div className="max-w-7xl mx-auto text-center space-y-4">
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <span className="text-2xl">🤖</span>
            </div>
            <span className={`text-2xl font-bold ${theme.textPrimary}`}>Virtual Assistant</span>
          </div>
          
          <p className={`${isDark ? 'text-white/60' : 'text-slate-700'} text-sm max-w-2xl mx-auto`}>
            Experience the future of AI assistance. Works on any website as a browser extension, 
            or use standalone for maximum productivity.
          </p>
          
          <div className="flex items-center justify-center gap-6 pt-6">
            <button className={`${isDark ? 'text-white/70 hover:text-white' : 'text-slate-700 hover:text-slate-900'} transition-colors text-sm`}>
              Features
            </button>
            <button className={`${isDark ? 'text-white/70 hover:text-white' : 'text-slate-700 hover:text-slate-900'} transition-colors text-sm`}>
              Documentation
            </button>
            <button className={`${isDark ? 'text-white/70 hover:text-white' : 'text-slate-700 hover:text-slate-900'} transition-colors text-sm`}>
              GitHub
            </button>
            <button className={`${isDark ? 'text-white/70 hover:text-white' : 'text-slate-700 hover:text-slate-900'} transition-colors text-sm`}>
              Support
            </button>
          </div>
          
          <div className={`pt-6 ${isDark ? 'text-white/40' : 'text-slate-500'} text-xs`}>
            © 2025 Virtual Assistant. Powered by AI.
          </div>
        </div>
      </footer>
    </div>
  );
};

export default DemoSite;
