/**
 * @fileoverview Demo landing page component showcasing VAssist features and Chrome AI APIs.
 * Provides interactive demos, installation guide, and feature overview with theme switching.
 */

import { useState } from 'react';
import { useApp } from '../contexts/AppContext';
import { Icon } from './icons';
import AIServiceProxy from '../services/proxies/AIServiceProxy';
import SummarizerServiceProxy from '../services/proxies/SummarizerServiceProxy';
import TranslatorServiceProxy from '../services/proxies/TranslatorServiceProxy';
import LanguageDetectorServiceProxy from '../services/proxies/LanguageDetectorServiceProxy';
import RewriterServiceProxy from '../services/proxies/RewriterServiceProxy';
import WriterServiceProxy from '../services/proxies/WriterServiceProxy';
import { TranslationLanguages } from '../config/aiConfig';

// Import demo images
import berriesImg from '../assets/demo/berries.jpg';
import kittenImg from '../assets/demo/kitten.jpg';
import peopleImg from '../assets/demo/people.jpg';
import textImg from '../assets/demo/text.jpg';

/**
 * Demo landing page component with interactive feature demonstrations.
 * 
 * @component
 * @returns {JSX.Element} The demo site layout with navigation, feature sections, and interactive demos
 */
const DemoSite = () => {
  const [activeSection, setActiveSection] = useState('hero');
  const { openChat } = useApp();

  const [pageTheme, setPageTheme] = useState('dark');
  
  const [improveText, setImproveText] = useState('hey can u help me with this thing? its kinda urgent and i need it done asap thx');
  const [rewriteTone, setRewriteTone] = useState('more-formal');
  const [rewriteLength, setRewriteLength] = useState('as-is');
  const [rewriteResponse, setRewriteResponse] = useState('');
  const [isRewriteLoading, setIsRewriteLoading] = useState(false);
  
  const [writerPrompt, setWriterPrompt] = useState('Write a product review for wireless headphones');
  const [writerTone, setWriterTone] = useState('casual');
  const [writerLength, setWriterLength] = useState('medium');
  const [writerResponse, setWriterResponse] = useState('');
  const [isWriterLoading, setIsWriterLoading] = useState(false);
  
  const [promptText, setPromptText] = useState('Explain quantum computing in simple terms');
  const [promptResponse, setPromptResponse] = useState('');
  const [isPromptLoading, setIsPromptLoading] = useState(false);
  
  const [summarizeText, setSummarizeText] = useState('Artificial intelligence (AI) is transforming the way we live and work. From virtual assistants to self-driving cars, AI is becoming increasingly integrated into our daily lives. Machine learning algorithms can now recognize patterns, make predictions, and even create art. However, with great power comes great responsibility, and we must ensure AI is developed ethically and transparently.');
  const [summarizeType, setSummarizeType] = useState('tl;dr');
  const [summarizeResponse, setSummarizeResponse] = useState('');
  const [isSummarizeLoading, setIsSummarizeLoading] = useState(false);
  
  const [translateText, setTranslateText] = useState('Hello! How are you doing today? I hope you are having a wonderful day.');
  const [targetLanguage, setTargetLanguage] = useState('es');
  const [translateResponse, setTranslateResponse] = useState('');
  const [isTranslateLoading, setIsTranslateLoading] = useState(false);
  
  const [detectText, setDetectText] = useState('Bonjour! Comment allez-vous?');
  const [detectResponse, setDetectResponse] = useState('');
  const [isDetectLoading, setIsDetectLoading] = useState(false);
  
  const [toolbarRewriteText, setToolbarRewriteText] = useState('i think ai is really cool and it can do alot of stuff like writing and translating it makes things easier and faster which is good for everyone who uses computers and the internet everyday');
  const [toolbarWriterText, setToolbarWriterText] = useState('');
  
  /**
   * Handles opening chat and triggering voice mode after a delay.
   */
  const handleVoiceChatClick = () => {
    openChat();
    setTimeout(() => {
      const event = new CustomEvent('startVoiceMode');
      window.dispatchEvent(event);
    }, 300);
  };

  /**
   * Handles submitting a prompt to the AI service.
   */
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

  /**
   * Handles summarizing text using the summarizer service.
   */
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

  /**
   * Handles translating text to the selected target language.
   */
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

  /**
   * Handles detecting the language of the provided text.
   */
  const handleDetectLanguage = async () => {
    if (isDetectLoading || !detectText.trim()) return;
    
    setIsDetectLoading(true);
    setDetectResponse('');
    
    try {
      const results = await LanguageDetectorServiceProxy.detect(detectText);
      if (results && results.length > 0) {
        const topResult = results[0];
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

  /**
   * Handles rewriting text with specified tone and length options.
   */
  const handleRewrite = async () => {
    if (isRewriteLoading || !improveText.trim()) return;
    
    setIsRewriteLoading(true);
    setRewriteResponse('');
    
    try {
      let fullRewrite = '';
      const options = { tone: rewriteTone, length: rewriteLength };
      const stream = await RewriterServiceProxy.rewriteStreaming(improveText, options);
      
      for await (const chunk of stream) {
        fullRewrite += chunk;
        setRewriteResponse(fullRewrite);
      }
    } catch (error) {
      setRewriteResponse('Error: ' + (error.message || 'Failed to rewrite'));
    } finally {
      setIsRewriteLoading(false);
    }
  };

  /**
   * Handles generating content using the writer service.
   */
  const handleWriter = async () => {
    if (isWriterLoading || !writerPrompt.trim()) return;
    
    setIsWriterLoading(true);
    setWriterResponse('');
    
    try {
      let fullContent = '';
      const options = { tone: writerTone, length: writerLength };
      const stream = await WriterServiceProxy.writeStreaming(writerPrompt, options);
      
      for await (const chunk of stream) {
        fullContent += chunk;
        setWriterResponse(fullContent);
      }
    } catch (error) {
      setWriterResponse('Error: ' + (error.message || 'Failed to generate content'));
    } finally {
      setIsWriterLoading(false);
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
      iconName: 'ai',
      title: '3D Character',
      description: 'Interactive 3D animated character appears on any webpage with emotions and gestures',
      color: 'from-purple-500 to-pink-500'
    },
    {
      iconName: 'chat',
      title: 'AI Chat Extension',
      description: 'Chat with AI on any website - your conversation history follows you everywhere',
      color: 'from-blue-500 to-cyan-500'
    },
    {
      iconName: 'microphone',
      title: 'Voice Interaction',
      description: 'Talk to your assistant on any webpage with natural voice chat and TTS responses',
      color: 'from-green-500 to-emerald-500'
    },
    {
      iconName: 'tools',
      title: 'AI Text Toolbar',
      description: 'Select any text on any website to summarize, translate, improve, rewrite, or analyze',
      color: 'from-orange-500 to-red-500'
    },
    {
      iconName: 'image',
      title: 'Image Analysis',
      description: 'Hover over any image on any website to describe, extract text, or analyze content',
      color: 'from-indigo-500 to-purple-500'
    },
    {
      iconName: 'lightning',
      title: 'Works Everywhere',
      description: 'Browser extension that works on every website you visit - no setup needed',
      color: 'from-yellow-500 to-orange-500'
    },
  ];

  /**
   * Scrolls to the specified section on the page.
   * 
   * @param {string} section - The section ID to scroll to
   */
  const handleScrollToSection = (section) => {
    const element = document.getElementById(section);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActiveSection(section);
    }
  };

  return (
    <div className={`absolute inset-0 overflow-auto custom-scrollbar transition-all duration-500 ${pageTheme === 'dark' ? 'bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900' : 'bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50'}`}>
      <div className={`fixed inset-0 opacity-40 ${isDark ? "bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0icmdiYSgyNTUsMjU1LDI1NSwwLjAzKSIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+')] " : "bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0icmdiYSgwLDAsMCwwLjAzKSIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+')]"}`}></div>
      
      <nav className={`fixed top-0 left-0 right-0 z-40 backdrop-blur-md border-b transition-all duration-500 ${pageTheme === 'dark' ? 'bg-slate-900/80 border-white/10' : 'bg-white/80 border-slate-200'}`}>
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3 sm:py-4 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <Icon name="ai" size={24} className="text-white" />
            </div>
            <div>
              <h1 className={`text-base sm:text-xl font-bold ${theme.textPrimary}`}>VAssist</h1>
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
          
          <div className="flex items-center gap-2 sm:gap-3">
            <div className={`inline-flex rounded-md p-0.5 sm:p-1 border transition-all ${isDark ? 'bg-white/5 border-white/10' : 'bg-slate-100 border-slate-200'}`}>
              <button
                onClick={() => setPageTheme('dark')}
                className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all flex items-center gap-1 ${isDark ? (pageTheme === 'dark' ? 'bg-white/10 text-white' : 'bg-slate-200 text-slate-900') : 'text-slate-600 hover:text-slate-900'}`}
              >
                <Icon name="moon" size={16} />
                <span className="hidden sm:inline">Dark</span>
              </button>
              <button
                onClick={() => setPageTheme('light')}
                className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all flex items-center gap-1 ${!isDark ? (pageTheme === 'light' ? 'bg-slate-200 text-slate-900' : 'text-slate-600 hover:text-slate-900') : 'text-white/70 hover:text-white'}`}
              >
                <Icon name="sun" size={16} />
                <span className="hidden sm:inline">Light</span>
              </button>
            </div>

            <button 
              onClick={() => openChat?.()}
              className={`px-3 sm:px-6 py-1.5 sm:py-2.5 rounded-lg text-xs sm:text-base font-medium flex items-center gap-2 ${isDark ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:from-purple-600 hover:to-pink-600 hover:shadow-lg hover:shadow-purple-500/50' : 'bg-slate-900/10 text-slate-900 border border-slate-200 hover:bg-slate-200'}`}
            >
              <Icon name="chat" size={16} className="sm:hidden" />
              <span className="hidden sm:inline">Start Chat</span>
            </button>
          </div>
        </div>
      </nav>

      <section id="hero" className="relative min-h-screen flex items-center justify-center px-3 sm:px-6 pt-20 sm:pt-24 pb-12 sm:pb-20">
        <div className="max-w-6xl mx-auto text-center space-y-6 sm:space-y-8 relative z-10">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] sm:w-[500px] h-[300px] sm:h-[500px] bg-gradient-to-r from-purple-500/30 to-pink-500/30 rounded-full blur-3xl animate-pulse"></div>
          
          <div className="relative">
            <h1 className={`text-4xl sm:text-6xl md:text-8xl font-bold mb-4 sm:mb-6 leading-tight ${isDark ? 'bg-gradient-to-r from-white via-purple-200 to-pink-200 bg-clip-text text-transparent' : 'bg-gradient-to-r from-slate-900 via-purple-600 to-pink-600 bg-clip-text text-transparent'}`}>
              Your AI Assistant
              <br />
              On Every Website
            </h1>
            
            <p className={`text-base sm:text-xl md:text-2xl ${theme.textMuted} max-w-3xl mx-auto mb-6 sm:mb-8 leading-relaxed px-2`}>
              A Chrome extension that brings AI superpowers to any webpage you visit. 
              <span className={`${isDark ? 'text-purple-300' : 'text-purple-600'} font-semibold`}> Chat, analyze, translate, and more - powered by Chrome's built-in AI.</span>
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
                onClick={() => {/* TODO: Add GitHub releases URL */}}
                className={`w-full sm:w-auto px-6 sm:px-8 py-3 sm:py-4 rounded-xl font-semibold text-base sm:text-lg transition-all border ${isDark ? 'bg-white/10 backdrop-blur-sm text-white border-white/20 hover:bg-white/20' : 'bg-slate-100 text-slate-900 border-slate-200 hover:bg-slate-200'} flex items-center justify-center gap-2`}
              >
                <Icon name="download" size={20} />
                <span>Install Extension</span>
              </button>
            </div>
            
            <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 text-xs sm:text-sm px-2">
              <span className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-full ${theme.badge} flex items-center gap-1.5`}>
                <Icon name="cpu" size={14} /> Chrome Extension
              </span>
              <span className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-full ${theme.badge} flex items-center gap-1.5`}>
                <Icon name="globe" size={14} /> Works on Any Website
              </span>
              <span className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-full ${theme.badge} flex items-center gap-1.5`}>
                <Icon name="ai" size={14} /> Chrome AI Powered
              </span>
              <span className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-full ${theme.badge} flex items-center gap-1.5`}>
                <Icon name="shield" size={14} /> Privacy First
              </span>
            </div>
          </div>
        </div>
        
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
          <div className="w-6 h-10 border-2 border-white/30 rounded-full flex items-start justify-center p-2">
            <div className="w-1.5 h-3 bg-white/50 rounded-full"></div>
          </div>
        </div>
      </section>

      <section id="features" className="relative py-16 sm:py-24 px-3 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12 sm:mb-16">
            <h2 className={`text-3xl sm:text-5xl font-bold ${theme.textPrimary} mb-3 sm:mb-4`}>Extension Features</h2>
            <p className={`text-base sm:text-xl ${theme.textMuted}`}>AI superpowers on every website you visit</p>
          </div>
          
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {features.map((feature, index) => (
              <div 
                key={index}
                className={`group relative p-6 sm:p-8 ${theme.card} rounded-2xl ${theme.cardHover} transition-all hover:scale-105 hover:shadow-2xl`}
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div className={`w-12 h-12 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br ${feature.color} flex items-center justify-center mb-3 sm:mb-4 group-hover:scale-110 transition-transform`}>
                  <Icon name={feature.iconName} size={32} className="text-white" />
                </div>
                <h3 className={`text-xl sm:text-2xl font-bold ${theme.textPrimary} mb-2 sm:mb-3`}>{feature.title}</h3>
                <p className={`${theme.textMuted} leading-relaxed text-sm sm:text-base`}>{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative py-16 sm:py-24 px-3 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12 sm:mb-16">
            <h2 className={`text-3xl sm:text-5xl font-bold ${theme.textPrimary} mb-3 sm:mb-4`}>Try the AI Toolbar</h2>
            <p className={`text-base sm:text-xl ${theme.textMuted} px-2`}>Click any button below to auto-select text and see the toolbar!</p>
          </div>

          <div className={`max-w-5xl mx-auto space-y-8`}>
            <div className={`p-6 sm:p-8 ${theme.card} rounded-2xl`}>
              <div className="flex items-center gap-3 mb-4">
                <Icon name="note" size={28} className={isDark ? 'text-blue-400' : 'text-blue-600'} />
                <h3 className={`text-xl sm:text-2xl font-bold ${theme.textPrimary}`}>Summarize</h3>
              </div>
              <div className={`${theme.subtleBg} p-4 sm:p-6 rounded-xl mb-4`}>
                <p id="summarize-text" className={`text-sm sm:text-base leading-relaxed ${isDark ? 'text-white/90' : 'text-slate-900'}`}>
                  Artificial intelligence has rapidly evolved over the past decade, transforming industries 
                  from healthcare to finance. Machine learning algorithms can now process vast amounts of data, 
                  identify patterns, and make predictions with remarkable accuracy. This technology is enabling 
                  personalized medicine, autonomous vehicles, and smart assistants that understand natural language. 
                  As AI continues to advance, it promises to solve complex problems and enhance human capabilities 
                  in ways we're only beginning to imagine.
                </p>
              </div>
              <div className={`mb-3 p-3 rounded-lg ${isDark ? 'bg-white/5 border border-white/10' : 'bg-slate-100/50 border border-slate-200'}`}>
                <p className={`text-xs sm:text-sm ${isDark ? 'text-white/70' : 'text-slate-600'}`}>
                  Click the button below to select the text. Then hover over the toolbar and click the <span className="inline-flex items-center"><Icon name="note" size={14} className="text-yellow-400" /></span> Summarize button. For more options, hover to see: <span className="inline-flex items-center"><Icon name="article" size={14} className="text-cyan-400" /></span> Headline, <span className="inline-flex items-center"><Icon name="key" size={14} className="text-yellow-500" /></span> Key Points, <span className="inline-flex items-center"><Icon name="magic" size={14} className="text-purple-500" /></span> Teaser.
                </p>
              </div>
              <button 
                onClick={() => {
                  const element = document.getElementById('summarize-text');
                  if (element) {
                    const selection = window.getSelection();
                    const range = document.createRange();
                    range.selectNodeContents(element);
                    selection?.removeAllRanges();
                    selection?.addRange(range);
                  }
                }}
                className={`w-full sm:w-auto px-6 py-3 rounded-lg font-semibold transition-all ${theme.ctaGradient} hover:scale-105 hover:shadow-lg`}
              >
                Try Summarize →
              </button>
            </div>

            <div className={`p-6 sm:p-8 ${theme.card} rounded-2xl`}>
              <div className="flex items-center gap-3 mb-4">
                <Icon name="globe" size={28} className={isDark ? 'text-green-400' : 'text-green-600'} />
                <h3 className={`text-xl sm:text-2xl font-bold ${theme.textPrimary}`}>Translate</h3>
              </div>
              <div className={`${theme.subtleBg} p-4 sm:p-6 rounded-xl mb-4`}>
                <p id="translate-text" className={`text-sm sm:text-base leading-relaxed ${isDark ? 'text-white/90' : 'text-slate-900'}`}>
                  Good morning! How are you today? I hope you're having a wonderful day. 
                  Technology has made it easier than ever to communicate across languages and cultures. 
                  With AI-powered translation, we can break down language barriers and connect with people 
                  around the world.
                </p>
              </div>
              <div className={`mb-3 p-3 rounded-lg ${isDark ? 'bg-white/5 border border-white/10' : 'bg-slate-100/50 border border-slate-200'}`}>
                <p className={`text-xs sm:text-sm ${isDark ? 'text-white/70' : 'text-slate-600'}`}>
                  Click the button below to select the text. Then hover over the toolbar and click the <span className="inline-flex items-center"><Icon name="globe" size={14} className="text-emerald-500" /></span> Translate button. For language detection, hover to see: <span className="inline-flex items-center"><Icon name="search" size={14} className="text-blue-400" /></span> Detect Lang.
                </p>
              </div>
              <button 
                onClick={() => {
                  const element = document.getElementById('translate-text');
                  if (element) {
                    const selection = window.getSelection();
                    const range = document.createRange();
                    range.selectNodeContents(element);
                    selection?.removeAllRanges();
                    selection?.addRange(range);
                  }
                }}
                className={`w-full sm:w-auto px-6 py-3 rounded-lg font-semibold transition-all ${theme.ctaGradient} hover:scale-105 hover:shadow-lg`}
              >
                Try Translate →
              </button>
            </div>

            <div className={`p-6 sm:p-8 ${theme.card} rounded-2xl`}>
              <div className="flex items-center gap-3 mb-4">
                <Icon name="write" size={28} className={isDark ? 'text-purple-400' : 'text-purple-600'} />
                <h3 className={`text-xl sm:text-2xl font-bold ${theme.textPrimary}`}>Improve & Rewrite</h3>
              </div>
              <div className={`${theme.subtleBg} p-4 sm:p-6 rounded-xl mb-4`}>
                <textarea 
                  id="rewrite-text"
                  value={toolbarRewriteText}
                  onChange={(e) => setToolbarRewriteText(e.target.value)}
                  className={`w-full text-sm sm:text-base leading-relaxed ${isDark ? 'text-white/90 bg-transparent' : 'text-slate-900 bg-transparent'} border-none outline-none resize-none min-h-[100px] focus:ring-0`}
                  placeholder="Enter text to improve..."
                />
              </div>
              <div className={`mb-3 p-3 rounded-lg ${isDark ? 'bg-white/5 border border-white/10' : 'bg-slate-100/50 border border-slate-200'}`}>
                <p className={`text-xs sm:text-sm ${isDark ? 'text-white/70' : 'text-slate-600'}`}>
                  Click the button below to select the text. Then hover over the toolbar and click the <span className="inline-flex items-center"><Icon name="write" size={14} className="text-purple-400" /></span> Rewrite button. More options: <span className="inline-flex items-center"><Icon name="check" size={14} className="text-green-500" /></span> Spelling, <span className="inline-flex items-center"><Icon name="formal" size={14} className="text-indigo-500" /></span> Formal, <span className="inline-flex items-center"><Icon name="casual" size={14} className="text-blue-400" /></span> Casual, <span className="inline-flex items-center"><Icon name="briefcase" size={14} className="text-blue-500" /></span> Professional, <span className="inline-flex items-center"><Icon name="compress" size={14} className="text-gray-400" /></span> Shorter, <span className="inline-flex items-center"><Icon name="note" size={14} className="text-yellow-400" /></span> Expand, <span className="inline-flex items-center"><Icon name="book" size={14} className="text-orange-400" /></span> Simplify, <span className="inline-flex items-center"><Icon name="lightning" size={14} className="text-yellow-500" /></span> Concise, <span className="inline-flex items-center"><Icon name="clarity" size={14} className="text-blue-400" /></span> Clarity, <span className="inline-flex items-center"><Icon name="edit" size={14} className="text-blue-400" /></span> Custom. After the result appears, click <span className="inline-flex items-center"><Icon name="download" size={14} className="text-green-400" /></span> Insert to replace the selected text.
                </p>
              </div>
              <button 
                onClick={() => {
                  const element = document.getElementById('rewrite-text');
                  if (element) {
                    element.focus();
                    element.select();
                    document.dispatchEvent(new Event('selectionchange'));
                  }
                }}
                className={`w-full sm:w-auto px-6 py-3 rounded-lg font-semibold transition-all ${theme.ctaGradient} hover:scale-105 hover:shadow-lg`}
              >
                Try Rewrite →
              </button>
            </div>

            <div className={`p-6 sm:p-8 ${theme.card} rounded-2xl`}>
              <div className="flex items-center gap-3 mb-4">
                <Icon name="edit" size={28} className={isDark ? 'text-blue-400' : 'text-blue-600'} />
                <h3 className={`text-xl sm:text-2xl font-bold ${theme.textPrimary}`}>AI Writer</h3>
              </div>
              <div className={`${theme.subtleBg} p-4 sm:p-6 rounded-xl mb-4`}>
                <textarea 
                  id="writer-text"
                  value={toolbarWriterText}
                  onChange={(e) => setToolbarWriterText(e.target.value)}
                  className={`w-full text-sm sm:text-base leading-relaxed ${isDark ? 'text-white/90 bg-transparent' : 'text-slate-900 bg-transparent'} border-none outline-none resize-none min-h-[80px] focus:ring-0`}
                  placeholder="Click the 'Try Writer' button below to start writing with AI..."
                />
              </div>
              <div className={`mb-3 p-3 rounded-lg ${isDark ? 'bg-white/5 border border-white/10' : 'bg-slate-100/50 border border-slate-200'}`}>
                <p className={`text-xs sm:text-sm ${isDark ? 'text-white/70' : 'text-slate-600'}`}>
                  Click the button below to activate the toolbar. Then click the <span className="inline-flex items-center"><Icon name="edit" size={14} className="text-blue-400" /></span> Write button, enter your prompt (e.g., "Write a product review for wireless headphones"), and click the <span className="inline-flex items-center"><Icon name="download" size={14} className="text-green-400" /></span> Insert button that appears to add the generated text.
                </p>
              </div>
              <button 
                onClick={() => {
                  const element = document.getElementById('writer-text');
                  if (element) {
                    element.focus();
                  }
                }}
                className={`w-full sm:w-auto px-6 py-3 rounded-lg font-semibold transition-all ${theme.ctaGradient} hover:scale-105 hover:shadow-lg`}
              >
                Try Writer →
              </button>
            </div>

            <div className={`p-6 sm:p-8 ${theme.card} rounded-2xl`}>
              <div className="flex items-center gap-3 mb-4">
                <Icon name="search" size={28} className={isDark ? 'text-blue-400' : 'text-blue-600'} />
                <h3 className={`text-xl sm:text-2xl font-bold ${theme.textPrimary}`}>Language Detector</h3>
              </div>
              <div className={`${theme.subtleBg} p-4 sm:p-6 rounded-xl mb-4`}>
                <p id="language-text" className={`text-sm sm:text-base leading-relaxed ${isDark ? 'text-white/90' : 'text-slate-900'}`}>
                  Bonjour! Comment allez-vous? Je suis très heureux de vous rencontrer aujourd'hui.
                </p>
              </div>
              <div className={`mb-3 p-3 rounded-lg ${isDark ? 'bg-white/5 border border-white/10' : 'bg-slate-100/50 border border-slate-200'}`}>
                <p className={`text-xs sm:text-sm ${isDark ? 'text-white/70' : 'text-slate-600'}`}>
                  Click the button below to select the French text. Then hover over the toolbar and click the <span className="inline-flex items-center"><Icon name="search" size={14} className="text-blue-400" /></span> Detect Lang button to automatically identify the language.
                </p>
              </div>
              <button 
                onClick={() => {
                  const element = document.getElementById('language-text');
                  if (element) {
                    const selection = window.getSelection();
                    const range = document.createRange();
                    range.selectNodeContents(element);
                    selection?.removeAllRanges();
                    selection?.addRange(range);
                  }
                }}
                className={`w-full sm:w-auto px-6 py-3 rounded-lg font-semibold transition-all ${theme.ctaGradient} hover:scale-105 hover:shadow-lg`}
              >
                Try Language Detector →
              </button>
            </div>

            <div className={`p-6 sm:p-8 ${theme.card} rounded-2xl`}>
              <div className="flex items-center gap-3 mb-4">
                <Icon name="microphone" size={28} className={isDark ? 'text-red-500' : 'text-red-600'} />
                <h3 className={`text-xl sm:text-2xl font-bold ${theme.textPrimary}`}>Voice Dictation</h3>
              </div>
              <div className={`${theme.subtleBg} p-4 sm:p-6 rounded-xl mb-4`}>
                <textarea 
                  id="dictation-text"
                  className={`w-full text-sm sm:text-base leading-relaxed ${isDark ? 'text-white/90 bg-transparent' : 'text-slate-900 bg-transparent'} border-none outline-none resize-none min-h-[80px] focus:ring-0`}
                  placeholder="Click the 'Try Dictation' button to enable voice input..."
                  readOnly
                />
              </div>
              <div className={`mb-3 p-3 rounded-lg ${isDark ? 'bg-white/5 border border-white/10' : 'bg-slate-100/50 border border-slate-200'}`}>
                <p className={`text-xs sm:text-sm ${isDark ? 'text-white/70' : 'text-slate-600'}`}>
                  Click the button below to focus the textarea. Then hover over the toolbar and click the <span className="inline-flex items-center"><Icon name="microphone" size={14} className="text-red-500" /></span> Dictate button to start voice recording. Speak naturally and your words will be transcribed in real-time.
                </p>
              </div>
              <button 
                onClick={() => {
                  const element = document.getElementById('dictation-text');
                  if (element) {
                    element.focus();
                  }
                }}
                className={`w-full sm:w-auto px-6 py-3 rounded-lg font-semibold transition-all ${theme.ctaGradient} hover:scale-105 hover:shadow-lg`}
              >
                Try Dictation →
              </button>
            </div>

            <div className={`p-6 sm:p-8 ${theme.card} rounded-2xl`}>
              <div className="flex items-center gap-3 mb-4">
                <Icon name="book" size={28} className={isDark ? 'text-orange-400' : 'text-orange-600'} />
                <h3 className={`text-xl sm:text-2xl font-bold ${theme.textPrimary}`}>Dictionary</h3>
              </div>
              <div className={`${theme.subtleBg} p-4 sm:p-6 rounded-xl mb-4`}>
                <p id="dictionary-text" className={`text-sm sm:text-base leading-relaxed ${isDark ? 'text-white/90' : 'text-slate-900'}`}>
                  The word <span className="font-semibold">serendipity</span> means finding something good without looking for it.
                </p>
              </div>
              <div className={`mb-3 p-3 rounded-lg ${isDark ? 'bg-white/5 border border-white/10' : 'bg-slate-100/50 border border-slate-200'}`}>
                <p className={`text-xs sm:text-sm ${isDark ? 'text-white/70' : 'text-slate-600'}`}>
                  Click the button below to select only the word "serendipity". Then hover over the toolbar and click the <span className="inline-flex items-center"><Icon name="book" size={14} className="text-orange-400" /></span> Dictionary button. More options: <span className="inline-flex items-center"><Icon name="refresh" size={14} className="text-blue-400" /></span> Synonyms, <span className="inline-flex items-center"><Icon name="bidirectional" size={14} className="text-cyan-400" /></span> Antonyms, <span className="inline-flex items-center"><Icon name="speaker" size={14} className="text-purple-400" /></span> Pronunciation, <span className="inline-flex items-center"><Icon name="idea" size={14} className="text-yellow-400" /></span> Examples.
                </p>
              </div>
              <button 
                onClick={() => {
                  const paragraph = document.getElementById('dictionary-text');
                  const span = paragraph?.querySelector('span');
                  if (span) {
                    const selection = window.getSelection();
                    const range = document.createRange();
                    range.selectNodeContents(span);
                    selection?.removeAllRanges();
                    selection?.addRange(range);
                    
                    const event = new Event('selectionchange', { bubbles: true });
                    document.dispatchEvent(event);
                  }
                }}
                className={`w-full sm:w-auto px-6 py-3 rounded-lg font-semibold transition-all ${theme.ctaGradient} hover:scale-105 hover:shadow-lg`}
              >
                Try Dictionary →
              </button>
            </div>

            <div className={`p-6 sm:p-8 ${theme.card} rounded-2xl`}>
              <div className="flex items-center gap-3 mb-4">
                <Icon name="image" size={28} className={isDark ? 'text-pink-400' : 'text-pink-600'} />
                <h3 className={`text-xl sm:text-2xl font-bold ${theme.textPrimary}`}>Image Analysis</h3>
              </div>
              <p className={`${theme.textMuted} mb-4 text-xs sm:text-sm`}>
                Hover over any image below to see the AI toolbar with image analysis options.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-4">
                <img 
                  src={berriesImg}
                  alt="Berries" 
                  className="aspect-square rounded-lg object-cover cursor-pointer hover:scale-105 transition-transform shadow-md"
                />
                <img 
                  src={kittenImg}
                  alt="Kitten" 
                  className="aspect-square rounded-lg object-cover cursor-pointer hover:scale-105 transition-transform shadow-md"
                />
                <img 
                  src={peopleImg}
                  alt="People" 
                  className="aspect-square rounded-lg object-cover cursor-pointer hover:scale-105 transition-transform shadow-md"
                />
                <img 
                  src={textImg}
                  alt="Text document" 
                  className="aspect-square rounded-lg object-cover cursor-pointer hover:scale-105 transition-transform shadow-md"
                />
              </div>
              <div className={`mb-3 p-3 rounded-lg ${isDark ? 'bg-white/5 border border-white/10' : 'bg-slate-100/50 border border-slate-200'}`}>
                <p className={`text-xs sm:text-sm ${isDark ? 'text-white/70' : 'text-slate-600'}`}>
                  Hover over any image above to activate the toolbar. Available options: <span className="inline-flex items-center"><Icon name="image" size={14} className="text-pink-400" /></span> Describe Image, <span className="inline-flex items-center"><Icon name="document" size={14} className="text-blue-400" /></span> Extract Text (OCR), <span className="inline-flex items-center"><Icon name="search" size={14} className="text-blue-400" /></span> Identify Objects.
                </p>
              </div>
            </div>

            <div className={`p-6 sm:p-8 ${theme.card} rounded-2xl border-2 ${isDark ? 'border-purple-500/30' : 'border-purple-300/50'}`}>
              <div className="flex items-center gap-3 mb-4">
                <Icon name="settings" size={28} className={isDark ? 'text-purple-400' : 'text-purple-600'} />
                <h3 className={`text-xl sm:text-2xl font-bold ${theme.textPrimary}`}>Customize Your Experience</h3>
              </div>
              <div className={`${theme.subtleBg} p-4 sm:p-6 rounded-xl mb-4`}>
                <h4 className={`text-base sm:text-lg font-semibold ${theme.textPrimary} mb-3`}>
                  <span className="inline-flex items-center"><Icon name="ai" size={18} className="text-cyan-400" /></span> Enable Colored Icons for Toolbar
                </h4>
                <p className={`text-sm sm:text-base leading-relaxed ${isDark ? 'text-white/80' : 'text-slate-700'} mb-4`}>
                  If you prefer a more colorful and vibrant toolbar, you can enable colored icons to make each feature stand out with its unique color.
                </p>
                <div className={`p-4 rounded-lg ${isDark ? 'bg-white/5 border border-white/10' : 'bg-slate-100 border border-slate-200'}`}>
                  <p className={`text-sm ${isDark ? 'text-white/90' : 'text-slate-800'} font-medium mb-2`}>Follow these steps:</p>
                  <ol className={`text-xs sm:text-sm ${isDark ? 'text-white/70' : 'text-slate-600'} space-y-2 list-decimal list-inside`}>
                    <li>Click the <span className="inline-flex items-center font-semibold"><Icon name="ai" size={14} className="text-cyan-400" /></span> <strong>Vassist button</strong> (floating button on the page)</li>
                    <li>Click the <span className="inline-flex items-center font-semibold"><Icon name="settings" size={14} className="text-gray-400" /></span> <strong>Settings button</strong> in the toolbar</li>
                    <li>Toggle on <strong>"Use Colored Icons"</strong></li>
                    <li>Toggle <strong>"Toolbar Only"</strong></li>
                  </ol>
                </div>
                <p className={`text-xs sm:text-sm ${isDark ? 'text-white/60' : 'text-slate-500'} mt-3 italic`}>
                  This will give each toolbar icon its unique color while keeping other interface elements clean and minimal.
                </p>
              </div>
            </div>

            <div className={`p-6 rounded-xl ${isDark ? 'bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/20' : 'bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200'}`}>
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0">
                  <div className={`w-12 h-12 rounded-full ${theme.ctaGradient} flex items-center justify-center`}>
                    <Icon name="info" size={24} className="text-white" />
                  </div>
                </div>
                <div className="flex-1">
                  <h4 className={`text-lg font-bold ${theme.textPrimary} mb-2`}>
                    💡 How It Works
                  </h4>
                  <p className={`text-sm ${theme.textMuted}`}>
                    Click any "Try..." button above to automatically select the text. 
                    The AI toolbar will appear with options to process the selected text. 
                    This is exactly how VAssist works on any website after you install the extension!
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="demos" className="relative py-16 sm:py-24 px-3 sm:px-6 bg-gradient-to-b from-transparent via-purple-900/20 to-transparent">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12 sm:mb-16">
            <h2 className={`text-3xl sm:text-5xl font-bold ${theme.textPrimary} mb-3 sm:mb-4`}>Try Chrome AI APIs</h2>
            <p className={`text-base sm:text-xl ${theme.textMuted} px-2`}>Experience on-device AI powered by Gemini Nano!</p>
          </div>
          
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
            <div className={`p-6 sm:p-8 ${theme.card} rounded-2xl ${theme.cardHover}`}>
              <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                <Icon name="write" size={28} className={isDark ? 'text-purple-400' : 'text-purple-600'} />
                <h3 className={`text-xl sm:text-2xl font-bold ${theme.textPrimary}`}>Summarizer</h3>
              </div>
              <p className={`${theme.textMuted} mb-3 sm:mb-4 text-xs sm:text-sm`}>Edit text and select summary type:</p>
              
              <textarea
                value={summarizeText}
                onChange={(e) => setSummarizeText(e.target.value)}
                className={`${theme.subtleBg} p-3 sm:p-4 rounded-lg w-full h-24 ${isDark ? 'text-white/90' : 'text-slate-900'} leading-relaxed text-xs sm:text-sm resize-none focus:outline-none focus:ring-2 ${isDark ? 'focus:ring-purple-500' : 'focus:ring-purple-400'} transition-all mb-3 custom-scrollbar`}
                placeholder="Enter text to summarize..."
              />
              
              <div className="flex justify-between gap-2 mb-3">
                <button
                  onClick={() => setSummarizeType('tl;dr')}
                  className={`px-2 py-1.5 rounded-lg text-xs border transition-all whitespace-nowrap flex-1 ${
                    summarizeType === 'tl;dr'
                      ? `${theme.purpleTag} ring-2 ${isDark ? 'ring-purple-400' : 'ring-purple-500'}`
                      : `${isDark ? 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10' : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'}`
                  }`}
                >
                  TL;DR
                </button>
                <button
                  onClick={() => setSummarizeType('key-points')}
                  className={`px-2 py-1.5 rounded-lg text-xs border transition-all whitespace-nowrap flex-1 ${
                    summarizeType === 'key-points'
                      ? `${theme.purpleTag} ring-2 ${isDark ? 'ring-purple-400' : 'ring-purple-500'}`
                      : `${isDark ? 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10' : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'}`
                  }`}
                >
                  Key Points
                </button>
                <button
                  onClick={() => setSummarizeType('headline')}
                  className={`px-2 py-1.5 rounded-lg text-xs border transition-all whitespace-nowrap flex-1 ${
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

            <div className={`p-6 sm:p-8 ${theme.card} rounded-2xl ${theme.cardHover}`}>
              <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                <Icon name="globe" size={28} className={isDark ? 'text-blue-400' : 'text-blue-600'} />
                <h3 className={`text-xl sm:text-2xl font-bold ${theme.textPrimary}`}>Translator</h3>
              </div>
              <p className={`${theme.textMuted} mb-3 sm:mb-4 text-xs sm:text-sm`}>Edit text and select target language:</p>
              
              <textarea
                value={translateText}
                onChange={(e) => setTranslateText(e.target.value)}
                className={`${theme.subtleBg} p-3 sm:p-4 rounded-lg w-full h-24 ${isDark ? 'text-white/90' : 'text-slate-900'} leading-relaxed text-xs sm:text-sm resize-none focus:outline-none focus:ring-2 ${isDark ? 'focus:ring-purple-500' : 'focus:ring-purple-400'} transition-all mb-3 custom-scrollbar`}
                placeholder="Enter text to translate..."
              />
              
              <div className="flex justify-between gap-2 mb-3">
                <button
                  onClick={() => setTargetLanguage('es')}
                  className={`px-2 py-1.5 rounded-lg text-xs border transition-all whitespace-nowrap flex-1 ${
                    targetLanguage === 'es'
                      ? `${theme.blueTag} ring-2 ${isDark ? 'ring-blue-400' : 'ring-blue-500'}`
                      : `${isDark ? 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10' : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'}`
                  }`}
                >
                  Spanish
                </button>
                <button
                  onClick={() => setTargetLanguage('fr')}
                  className={`px-2 py-1.5 rounded-lg text-xs border transition-all whitespace-nowrap flex-1 ${
                    targetLanguage === 'fr'
                      ? `${theme.blueTag} ring-2 ${isDark ? 'ring-blue-400' : 'ring-blue-500'}`
                      : `${isDark ? 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10' : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'}`
                  }`}
                >
                  French
                </button>
                <button
                  onClick={() => setTargetLanguage('ja')}
                  className={`px-2 py-1.5 rounded-lg text-xs border transition-all whitespace-nowrap flex-1 ${
                    targetLanguage === 'ja'
                      ? `${theme.blueTag} ring-2 ${isDark ? 'ring-blue-400' : 'ring-blue-500'}`
                      : `${isDark ? 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10' : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'}`
                  }`}
                >
                  Japanese
                </button>
                <button
                  onClick={() => setTargetLanguage('de')}
                  className={`px-2 py-1.5 rounded-lg text-xs border transition-all whitespace-nowrap flex-1 ${
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

            <div className={`p-6 sm:p-8 ${theme.card} rounded-2xl ${theme.cardHover}`}>
              <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                <Icon name="language" size={28} className={isDark ? 'text-cyan-400' : 'text-cyan-600'} />
                <h3 className={`text-xl sm:text-2xl font-bold ${theme.textPrimary}`}>Language Detector</h3>
              </div>
              <p className={`${theme.textMuted} mb-3 sm:mb-4 text-xs sm:text-sm`}>Edit text to detect its language:</p>
              
              <textarea
                value={detectText}
                onChange={(e) => setDetectText(e.target.value)}
                className={`${theme.subtleBg} p-3 sm:p-4 rounded-lg w-full h-24 ${isDark ? 'text-white/90' : 'text-slate-900'} leading-relaxed text-xs sm:text-sm resize-none focus:outline-none focus:ring-2 ${isDark ? 'focus:ring-purple-500' : 'focus:ring-purple-400'} transition-all mb-3 custom-scrollbar`}
                placeholder="Enter text in any language..."
              />
              
              <div className="flex justify-between gap-2 mb-3">
                <span className={`px-2 py-1.5 rounded-lg text-xs border whitespace-nowrap flex-1 text-center ${isDark ? 'bg-white/5 text-white/50 border-white/10' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                  Auto
                </span>
                <span className={`px-2 py-1.5 rounded-lg text-xs border whitespace-nowrap flex-1 text-center ${isDark ? 'bg-white/5 text-white/50 border-white/10' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                  Fast
                </span>
                <span className={`px-2 py-1.5 rounded-lg text-xs border whitespace-nowrap flex-1 text-center ${isDark ? 'bg-white/5 text-white/50 border-white/10' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                  Accurate
                </span>
                <span className={`px-2 py-1.5 rounded-lg text-xs border whitespace-nowrap flex-1 text-center ${isDark ? 'bg-white/5 text-white/50 border-white/10' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                  100+ Lang
                </span>
              </div>
              
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
                <div className={`${theme.subtleBg} p-3 sm:p-4 rounded-lg min-h-[60px]`}>
                  <p className={`text-xs sm:text-sm ${isDark ? 'text-white/90' : 'text-slate-900'} whitespace-pre-wrap`}>
                    {isDetectLoading && !detectResponse ? 'Detecting...' : detectResponse}
                  </p>
                </div>
              )}
            </div>

            <div className={`p-6 sm:p-8 ${theme.card} rounded-2xl ${theme.cardHover}`}>
              <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                <Icon name="ai" size={28} className={isDark ? 'text-pink-400' : 'text-pink-600'} />
                <h3 className={`text-xl sm:text-2xl font-bold ${theme.textPrimary}`}>Rewriter</h3>
              </div>
              <p className={`${theme.textMuted} mb-3 sm:mb-4 text-xs sm:text-sm`}>Edit text and select rewrite options:</p>
              
              <textarea
                value={improveText}
                onChange={(e) => setImproveText(e.target.value)}
                className={`${theme.subtleBg} p-3 sm:p-4 rounded-lg w-full h-24 ${isDark ? 'text-white/90' : 'text-slate-900'} leading-relaxed text-xs sm:text-sm resize-none focus:outline-none focus:ring-2 ${isDark ? 'focus:ring-purple-500' : 'focus:ring-purple-400'} transition-all custom-scrollbar mb-3`}
                placeholder="Type something to rewrite..."
              />
              
              <div className="flex justify-between gap-2 mb-3">
                <button
                  onClick={() => setRewriteTone('more-formal')}
                  className={`px-2 py-1.5 rounded-lg text-xs border transition-all whitespace-nowrap flex-1 ${
                    rewriteTone === 'more-formal'
                      ? `${theme.orangeTag} ring-2 ${isDark ? 'ring-orange-400' : 'ring-orange-500'}`
                      : `${isDark ? 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10' : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'}`
                  }`}
                >
                  Formal
                </button>
                <button
                  onClick={() => setRewriteTone('more-casual')}
                  className={`px-2 py-1.5 rounded-lg text-xs border transition-all whitespace-nowrap flex-1 ${
                    rewriteTone === 'more-casual'
                      ? `${theme.orangeTag} ring-2 ${isDark ? 'ring-orange-400' : 'ring-orange-500'}`
                      : `${isDark ? 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10' : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'}`
                  }`}
                >
                  Casual
                </button>
                <button
                  onClick={() => setRewriteLength('shorter')}
                  className={`px-2 py-1.5 rounded-lg text-xs border transition-all whitespace-nowrap flex-1 ${
                    rewriteLength === 'shorter'
                      ? `${theme.orangeTag} ring-2 ${isDark ? 'ring-orange-400' : 'ring-orange-500'}`
                      : `${isDark ? 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10' : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'}`
                  }`}
                >
                  Shorter
                </button>
                <button
                  onClick={() => setRewriteLength('longer')}
                  className={`px-2 py-1.5 rounded-lg text-xs border transition-all whitespace-nowrap flex-1 ${
                    rewriteLength === 'longer'
                      ? `${theme.orangeTag} ring-2 ${isDark ? 'ring-orange-400' : 'ring-orange-500'}`
                      : `${isDark ? 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10' : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'}`
                  }`}
                >
                  Longer
                </button>
              </div>
              
              <button
                onClick={handleRewrite}
                disabled={isRewriteLoading || !improveText.trim()}
                className={`w-full px-4 py-2 rounded-lg font-semibold text-xs sm:text-sm transition-all mb-3 ${
                  isRewriteLoading || !improveText.trim()
                    ? (isDark ? 'bg-white/5 text-white/30' : 'bg-slate-100 text-slate-300')
                    : `${theme.ctaGradient} hover:scale-105`
                }`}
              >
                {isRewriteLoading ? 'Rewriting...' : 'Rewrite Text'}
              </button>
              
              {(rewriteResponse || isRewriteLoading) && (
                <div className={`${theme.subtleBg} p-3 sm:p-4 rounded-lg min-h-[60px]`}>
                  <p className={`text-xs sm:text-sm ${isDark ? 'text-white/90' : 'text-slate-900'} whitespace-pre-wrap`}>
                    {isRewriteLoading && !rewriteResponse ? 'Rewriting...' : rewriteResponse}
                  </p>
                </div>
              )}
            </div>

            <div className={`p-6 sm:p-8 ${theme.card} rounded-2xl ${theme.cardHover}`}>
              <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                <Icon name="pen" size={28} className={isDark ? 'text-green-400' : 'text-green-600'} />
                <h3 className={`text-xl sm:text-2xl font-bold ${theme.textPrimary}`}>Writer</h3>
              </div>
              <p className={`${theme.textMuted} mb-3 sm:mb-4 text-xs sm:text-sm`}>Enter a prompt and select writing options:</p>
              
              <textarea
                value={writerPrompt}
                onChange={(e) => setWriterPrompt(e.target.value)}
                className={`${theme.subtleBg} p-3 sm:p-4 rounded-lg w-full h-24 ${isDark ? 'text-white/90' : 'text-slate-900'} leading-relaxed text-xs sm:text-sm resize-none focus:outline-none focus:ring-2 ${isDark ? 'focus:ring-purple-500' : 'focus:ring-purple-400'} transition-all custom-scrollbar mb-3`}
                placeholder="Write a prompt for content generation..."
              />
              
              <div className="flex justify-between gap-2 mb-3">
                <button
                  onClick={() => setWriterTone('casual')}
                  className={`px-2 py-1.5 rounded-lg text-xs border transition-all whitespace-nowrap flex-1 ${
                    writerTone === 'casual'
                      ? `${theme.pinkTag} ring-2 ${isDark ? 'ring-pink-400' : 'ring-pink-500'}`
                      : `${isDark ? 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10' : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'}`
                  }`}
                >
                  Casual
                </button>
                <button
                  onClick={() => setWriterTone('formal')}
                  className={`px-2 py-1.5 rounded-lg text-xs border transition-all whitespace-nowrap flex-1 ${
                    writerTone === 'formal'
                      ? `${theme.pinkTag} ring-2 ${isDark ? 'ring-pink-400' : 'ring-pink-500'}`
                      : `${isDark ? 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10' : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'}`
                  }`}
                >
                  Formal
                </button>
                <button
                  onClick={() => setWriterLength('short')}
                  className={`px-2 py-1.5 rounded-lg text-xs border transition-all whitespace-nowrap flex-1 ${
                    writerLength === 'short'
                      ? `${theme.pinkTag} ring-2 ${isDark ? 'ring-pink-400' : 'ring-pink-500'}`
                      : `${isDark ? 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10' : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'}`
                  }`}
                >
                  Short
                </button>
                <button
                  onClick={() => setWriterLength('long')}
                  className={`px-2 py-1.5 rounded-lg text-xs border transition-all whitespace-nowrap flex-1 ${
                    writerLength === 'long'
                      ? `${theme.pinkTag} ring-2 ${isDark ? 'ring-pink-400' : 'ring-pink-500'}`
                      : `${isDark ? 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10' : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'}`
                  }`}
                >
                  Long
                </button>
              </div>
              
              <button
                onClick={handleWriter}
                disabled={isWriterLoading || !writerPrompt.trim()}
                className={`w-full px-4 py-2 rounded-lg font-semibold text-xs sm:text-sm transition-all mb-3 ${
                  isWriterLoading || !writerPrompt.trim()
                    ? (isDark ? 'bg-white/5 text-white/30' : 'bg-slate-100 text-slate-300')
                    : `${theme.ctaGradient} hover:scale-105`
                }`}
              >
                {isWriterLoading ? 'Writing...' : 'Generate Content'}
              </button>
              
              {(writerResponse || isWriterLoading) && (
                <div className={`${theme.subtleBg} p-3 sm:p-4 rounded-lg min-h-[60px]`}>
                  <p className={`text-xs sm:text-sm ${isDark ? 'text-white/90' : 'text-slate-900'} whitespace-pre-wrap`}>
                    {isWriterLoading && !writerResponse ? 'Generating...' : writerResponse}
                  </p>
                </div>
              )}
            </div>

            <div className={`p-6 sm:p-8 ${theme.card} rounded-2xl ${theme.cardHover}`}>
              <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                <Icon name="ai" size={28} className={isDark ? 'text-purple-400' : 'text-purple-600'} />
                <h3 className={`text-xl sm:text-2xl font-bold ${theme.textPrimary}`}>Prompt API</h3>
              </div>
              <p className={`${theme.textMuted} mb-3 sm:mb-4 text-xs sm:text-sm`}>Ask anything - custom AI prompting:</p>
              
              <textarea
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handlePromptSubmit())}
                className={`${theme.subtleBg} p-3 sm:p-4 rounded-lg w-full h-24 ${isDark ? 'text-white/90' : 'text-slate-900'} text-xs sm:text-sm resize-none focus:outline-none focus:ring-2 ${isDark ? 'focus:ring-purple-500' : 'focus:ring-purple-400'} transition-all mb-3 custom-scrollbar`}
                placeholder="Ask the AI anything..."
                disabled={isPromptLoading}
              />
              
              <div className="flex justify-between gap-2 mb-3">
                <span className={`px-2 py-1.5 rounded-lg text-xs border whitespace-nowrap flex-1 text-center ${isDark ? 'bg-white/5 text-white/50 border-white/10' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                  Custom
                </span>
                <span className={`px-2 py-1.5 rounded-lg text-xs border whitespace-nowrap flex-1 text-center ${isDark ? 'bg-white/5 text-white/50 border-white/10' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                  Stream
                </span>
                <span className={`px-2 py-1.5 rounded-lg text-xs border whitespace-nowrap flex-1 text-center ${isDark ? 'bg-white/5 text-white/50 border-white/10' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                  Context
                </span>
                <span className={`px-2 py-1.5 rounded-lg text-xs border whitespace-nowrap flex-1 text-center ${isDark ? 'bg-white/5 text-white/50 border-white/10' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                  Multi-turn
                </span>
              </div>
              
              <button
                onClick={handlePromptSubmit}
                disabled={isPromptLoading || !promptText.trim()}
                className={`w-full px-4 py-2 rounded-lg font-semibold text-xs sm:text-sm transition-all mb-3 ${
                  isPromptLoading || !promptText.trim() 
                    ? (isDark ? 'bg-white/5 text-white/30' : 'bg-slate-100 text-slate-300')
                    : `${theme.ctaGradient} hover:scale-105`
                }`}
              >
                {isPromptLoading ? 'Thinking...' : 'Send'}
              </button>
              
              {(promptResponse || isPromptLoading) && (
                <div className={`${theme.subtleBg} p-3 sm:p-4 rounded-lg min-h-[80px]`}>
                  <p className={`text-xs sm:text-sm ${isDark ? 'text-white/90' : 'text-slate-900'} whitespace-pre-wrap`}>
                    {isPromptLoading && !promptResponse ? 'Thinking...' : promptResponse}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section id="theme-demo" className="relative py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-8">
            <h2 className={`text-4xl font-bold mb-4 ${pageTheme === 'dark' ? 'text-white' : 'text-slate-900'}`}>Theme Switching Demo</h2>
            <p className={`text-lg ${pageTheme === 'dark' ? 'text-white/70' : 'text-slate-700'}`}>
              Use the theme toggle in the navigation bar to switch between dark and light modes. 
              See how VAssist adapts to different backgrounds!
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div className={`${pageTheme === 'light' ? 'bg-white text-slate-900 border-2 border-slate-300' : 'bg-slate-900 text-white border-2 border-white/20'} p-8 rounded-2xl shadow-2xl transition-all duration-500`}> 
              <div className="flex items-center gap-4 mb-4">
                <div className={`w-12 h-12 rounded-lg ${pageTheme === 'light' ? 'bg-gradient-to-br from-blue-500 to-cyan-500' : 'bg-gradient-to-br from-purple-500 to-pink-500'} flex items-center justify-center`}>
                  <Icon name="ai" size={24} className="text-white" />
                </div>
                <div>
                  <h3 className={`text-2xl font-bold ${pageTheme === 'light' ? 'text-slate-900' : 'text-white'}`}>VAssist</h3>
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
                    className={`px-4 py-2 rounded-md font-medium transition-all flex items-center gap-2 ${pageTheme === 'dark' ? 'bg-purple-600 text-white scale-105' : (pageTheme === 'light' ? 'bg-slate-200 text-slate-700 hover:bg-slate-300' : 'bg-white/5 text-white hover:bg-white/10')}`}
                  >
                    <Icon name="moon" size={16} /> Dark
                  </button>
                  <button 
                    onClick={() => setPageTheme('light')} 
                    className={`px-4 py-2 rounded-md font-medium transition-all flex items-center gap-2 ${pageTheme === 'light' ? 'bg-blue-600 text-white scale-105' : (pageTheme === 'dark' ? 'bg-white/5 text-white hover:bg-white/10' : 'bg-slate-200 text-slate-700')}`}
                  >
                    <Icon name="sun" size={16} /> Light
                  </button>
                </div>
              </div>
            </div>

            <div>
              <div className={`p-8 rounded-2xl transition-all duration-500 ${pageTheme === 'dark' ? 'bg-white/5 border border-white/10 text-white' : 'bg-white shadow-lg border border-slate-200 text-slate-900'}`}>
                <h4 className={`text-xl font-bold mb-3 ${pageTheme === 'light' ? 'text-slate-900' : 'text-white'}`}>How Auto-Detection Works</h4>
                <p className={`text-sm mb-4 ${pageTheme === 'light' ? 'text-slate-700' : 'text-white/70'}`}>
                  The VAssist extension intelligently adapts to any website's color scheme:
                </p>
                <ul className={`text-sm space-y-2 ${pageTheme === 'light' ? 'text-slate-700' : 'text-white/70'}`}>
                  <li className="flex items-start gap-2">
                    <Icon name="check" size={18} className={pageTheme === 'light' ? 'text-green-600' : 'text-green-400'} />
                    <span>Automatically detects light vs dark backgrounds</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Icon name="check" size={18} className={pageTheme === 'light' ? 'text-green-600' : 'text-green-400'} />
                    <span>Adjusts text colors for optimal contrast</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Icon name="check" size={18} className={pageTheme === 'light' ? 'text-green-600' : 'text-green-400'} />
                    <span>Changes UI elements to match the site's theme</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Icon name="check" size={18} className={pageTheme === 'light' ? 'text-green-600' : 'text-green-400'} />
                    <span>Works seamlessly on any website</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="relative py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className={`text-5xl font-bold ${theme.textPrimary} mb-4`}>Installation Guide</h2>
            <p className={`text-xl ${theme.textMuted}`}>Follow these simple steps to install VAssist</p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
            <div className={`p-6 ${theme.card} rounded-2xl`}>
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-2xl font-bold text-white">
                1
              </div>
              <h3 className={`text-xl font-bold ${theme.textPrimary} mb-3 text-center`}>Download</h3>
              <p className={`${theme.textMuted} text-sm text-center`}>
                Download the latest <span className="font-semibold">vassist-extension.zip</span> from the GitHub releases page
              </p>
            </div>
            
            <div className={`p-6 ${theme.card} rounded-2xl`}>
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-2xl font-bold text-white">
                2
              </div>
              <h3 className={`text-xl font-bold ${theme.textPrimary} mb-3 text-center`}>Extract</h3>
              <p className={`${theme.textMuted} text-sm text-center`}>
                Unzip the downloaded file to a folder on your computer (keep this folder - don't delete it!)
              </p>
            </div>
            
            <div className={`p-6 ${theme.card} rounded-2xl`}>
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center text-2xl font-bold text-white">
                3
              </div>
              <h3 className={`text-xl font-bold ${theme.textPrimary} mb-3 text-center`}>Enable Dev Mode</h3>
              <p className={`${theme.textMuted} text-sm text-center`}>
                Go to <span className="font-mono text-xs">chrome://extensions</span>, turn on <span className="font-semibold">Developer mode</span> (top-right toggle)
              </p>
            </div>
            
            <div className={`p-6 ${theme.card} rounded-2xl`}>
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center text-2xl font-bold text-white">
                4
              </div>
              <h3 className={`text-xl font-bold ${theme.textPrimary} mb-3 text-center`}>Load Extension</h3>
              <p className={`${theme.textMuted} text-sm text-center`}>
                Click <span className="font-semibold">Load unpacked</span> and select the extracted folder. Done!
              </p>
            </div>
          </div>

          <div className="text-center mb-12 mt-16">
            <h2 className={`text-4xl font-bold ${theme.textPrimary} mb-4`}>How to Use</h2>
            <p className={`text-lg ${theme.textMuted}`}>Once installed, VAssist works on every website you visit</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center space-y-4">
              <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-3xl font-bold text-white">
                1
              </div>
              <h3 className={`text-2xl font-bold ${theme.textPrimary}`}>Open VAssist</h3>
              <p className={`${theme.textMuted}`}>Click the extension icon in your browser toolbar to open the assistant</p>
            </div>
            
            <div className="text-center space-y-4">
              <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-3xl font-bold text-white">
                2
              </div>
              <h3 className={`text-2xl font-bold ${theme.textPrimary}`}>Select & Use Tools</h3>
              <p className={`${theme.textMuted}`}>Highlight text or hover over images to see the AI toolbar appear automatically</p>
            </div>
            
            <div className="text-center space-y-4">
              <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center text-3xl font-bold text-white">
                3
              </div>
              <h3 className={`text-2xl font-bold ${theme.textPrimary}`}>Get AI Results</h3>
              <p className={`${theme.textMuted}`}>Chat, translate, summarize, or analyze - all powered by Chrome's built-in AI</p>
            </div>
          </div>

          <div className={`mt-16 p-12 rounded-3xl border text-center transition-all duration-300 ${isDark ? 'bg-gradient-to-r from-purple-500/20 to-pink-500/20 border-white/20' : 'bg-white shadow-sm border-slate-200'}`}>
            <h3 className={`text-4xl font-bold mb-4 ${theme.textPrimary}`}>Try It Now</h3>
            <p className={`text-xl mb-8 max-w-2xl mx-auto ${isDark ? 'text-white/80' : 'text-slate-700'}`}>
              Click the button below to see VAssist appear on this page. You can chat with AI, 
              use voice commands, or interact with the 3D character - just like it would work on any website!
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button 
                onClick={() => openChat?.()}
                className={`px-8 py-4 rounded-xl font-semibold text-lg transition-all flex items-center gap-3 ${theme.ctaGradient} hover:scale-105 hover:shadow-2xl`}
              >
                <Icon name="chat" size={20} className="text-white" /> Open Chat
              </button>
              <button 
                onClick={handleVoiceChatClick}
                className={`px-8 py-4 rounded-xl font-semibold text-lg transition-all flex items-center gap-3 ${isDark ? 'bg-white/10 text-white border border-white/20 hover:bg-white/20' : 'bg-slate-100 text-slate-900 border border-slate-200 hover:bg-slate-200'}`}
              >
                <Icon name="microphone" size={20} /> Try Voice Mode
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="relative py-24 px-6 bg-gradient-to-b from-transparent via-purple-900/20 to-transparent">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className={`text-5xl font-bold ${theme.textPrimary} mb-4`}>Perfect For</h2>
            <p className={`text-xl ${theme.textMuted}`}>See how people use the extension on different websites</p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className={`p-6 ${theme.card} rounded-2xl ${theme.cardHover} text-center`}>
              <div className="flex justify-center mb-3">
                <Icon name="cpu" size={48} className={isDark ? 'text-blue-400' : 'text-blue-600'} />
              </div>
              <h4 className={`text-xl font-bold ${theme.textPrimary} mb-2`}>On GitHub</h4>
              <p className={`${theme.textMuted} text-sm`}>Summarize code, explain functions, review pull requests</p>
            </div>
            
            <div className={`p-6 ${theme.card} rounded-2xl ${theme.cardHover} text-center`}>
              <div className="flex justify-center mb-3">
                <Icon name="globe" size={48} className={isDark ? 'text-purple-400' : 'text-purple-600'} />
              </div>
              <h4 className={`text-xl font-bold ${theme.textPrimary} mb-2`}>On News Sites</h4>
              <p className={`${theme.textMuted} text-sm`}>Summarize articles, translate content, detect language</p>
            </div>
            
            <div className={`p-6 ${theme.card} rounded-2xl ${theme.cardHover} text-center`}>
              <div className="flex justify-center mb-3">
                <Icon name="image" size={48} className={isDark ? 'text-green-400' : 'text-green-600'} />
              </div>
              <h4 className={`text-xl font-bold ${theme.textPrimary} mb-2`}>On Shopping Sites</h4>
              <p className={`${theme.textMuted} text-sm`}>Analyze product images, translate reviews, compare descriptions</p>
            </div>
            
            <div className={`p-6 ${theme.card} rounded-2xl ${theme.cardHover} text-center`}>
              <div className="flex justify-center mb-3">
                <Icon name="pen" size={48} className={isDark ? 'text-orange-400' : 'text-orange-600'} />
              </div>
              <h4 className={`text-xl font-bold ${theme.textPrimary} mb-2`}>On Email/Docs</h4>
              <p className={`${theme.textMuted} text-sm`}>Improve writing, rewrite tone, fix grammar instantly</p>
            </div>
          </div>
        </div>
      </section>

      <footer className="relative py-12 px-6 border-t border-white/10">
        <div className="max-w-7xl mx-auto text-center space-y-4">
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <Icon name="ai" size={24} className="text-white" />
            </div>
            <span className={`text-2xl font-bold ${theme.textPrimary}`}>VAssist</span>
          </div>
          
          <p className={`${isDark ? 'text-white/60' : 'text-slate-700'} text-sm max-w-2xl mx-auto`}>
            A Chrome extension that brings AI capabilities to every website you visit. 
            Powered by Chrome's built-in AI APIs for privacy and performance.
          </p>
          
          <div className="flex items-center justify-center gap-6 pt-6">
            <button 
              onClick={() => openChat?.()}
              className={`${isDark ? 'text-white/70 hover:text-white' : 'text-slate-700 hover:text-slate-900'} transition-colors text-sm`}
            >
              Try Demo
            </button>
            <button 
              onClick={() => handleScrollToSection('features')}
              className={`${isDark ? 'text-white/70 hover:text-white' : 'text-slate-700 hover:text-slate-900'} transition-colors text-sm`}
            >
              Features
            </button>
            <button 
              onClick={() => {/* TODO: Add GitHub URL */}}
              className={`${isDark ? 'text-white/70 hover:text-white' : 'text-slate-700 hover:text-slate-900'} transition-colors text-sm`}
            >
              GitHub
            </button>
            <button 
              onClick={() => handleScrollToSection('demos')}
              className={`${isDark ? 'text-white/70 hover:text-white' : 'text-slate-700 hover:text-slate-900'} transition-colors text-sm`}
            >
              Chrome AI Demos
            </button>
          </div>
          
          <div className={`pt-6 ${isDark ? 'text-white/40' : 'text-slate-500'} text-xs`}>
            © 2025 VAssist. Built for Chrome AI Challenge.
          </div>
        </div>
      </footer>
    </div>
  );
};

export default DemoSite;
