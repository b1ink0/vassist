import { useState } from 'react';
import { Icon } from '../icons';
import { useApp } from '../../contexts/AppContext';

const DocumentInteractionDemo = ({ theme, isDark }) => {
  const [showHiddenContent, setShowHiddenContent] = useState(false);
  const { handleAddToChat } = useApp();

  const handleTryAction = (question) => {
    handleAddToChat({
      text: question
    }, true); // Enable auto-send
  };

  const demoActions = [
    {
      title: 'Extract Links from Page',
      description: 'VAssist can find and organize all links on any webpage',
      question: 'Extract all links from this page and organize them by type',
      icon: 'link',
      color: isDark ? 'text-blue-400' : 'text-blue-600'
    },
    {
      title: 'Analyze Table Data',
      description: 'Extract and analyze data from tables',
      question: 'Extract the weather forecast table data and summarize the weekly pattern',
      icon: 'stats', // Changed from 'table' to 'stats'
      color: isDark ? 'text-green-400' : 'text-green-600'
    },
    {
      title: 'Explain Code Snippets',
      description: 'Get explanations for any code on the page',
      question: 'Explain what the first code block on this page does',
      icon: 'document', // Changed from 'code' to 'document'
      color: isDark ? 'text-purple-400' : 'text-purple-600'
    },
    {
      title: 'Help Fill Forms',
      description: 'Get AI assistance with form completion',
      question: 'Help me write a professional message for the contact form',
      icon: 'edit',
      color: isDark ? 'text-orange-400' : 'text-orange-600'
    },
    {
      title: 'Summarize Articles',
      description: 'Get quick summaries of long content',
      question: 'Summarize the main article on this page in 3 key points',
      icon: 'file-text',
      color: isDark ? 'text-cyan-400' : 'text-cyan-600'
    }
  ];

  return (
    <section className="relative py-12 sm:py-16 px-3 sm:px-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-12">
          <h2 className={`text-3xl sm:text-4xl lg:text-5xl font-bold mb-4 ${theme.gradient}`}>
            Document Interaction Demo
          </h2>
          <p className={`text-base sm:text-lg ${theme.textSecondary} max-w-3xl mx-auto`}>
            This page contains hidden content (tables, links, forms, code). Click "Try" to see how VAssist can extract it!
          </p>
        </div>

        <div className="mb-8 text-center flex flex-wrap justify-center gap-4">
          <button
            onClick={() => setShowHiddenContent(!showHiddenContent)}
            className={`cursor-pointer px-6 py-3 rounded-lg font-semibold transition-all ${isDark ? 'bg-white/10 hover:bg-white/20' : 'bg-slate-200 hover:bg-slate-300'} ${theme.textPrimary} inline-flex items-center gap-2`}
          >
            <Icon name={showHiddenContent ? 'eye-off' : 'eye'} size={20} />
            {showHiddenContent ? 'Hide' : 'Show'} Hidden Content
          </button>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          {demoActions.map((action, idx) => (
            <div key={idx} className={`p-6 ${theme.card} rounded-xl border ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
              <div className="flex items-start gap-4 mb-4">
                <div className={`p-3 rounded-lg ${isDark ? 'bg-white/5' : 'bg-slate-100'}`}>
                  <Icon name={action.icon} size={24} className={action.color} />
                </div>
                <div className="flex-1">
                  <h3 className={`text-lg font-bold ${theme.textPrimary} mb-1`}>{action.title}</h3>
                  <p className={`text-sm ${theme.textSecondary}`}>{action.description}</p>
                </div>
              </div>
              <button
                onClick={() => handleTryAction(action.question)}
                className={`cursor-pointer w-full px-4 py-2 rounded-lg font-semibold transition-all ${theme.ctaGradient} hover:scale-105 flex items-center justify-center gap-2`}
              >
                <Icon name="play" size={16} />
                Try This
              </button>
            </div>
          ))}
        </div>

        <div className={showHiddenContent ? 'block' : 'hidden'}>
          <div className={`p-6 sm:p-8 ${theme.card} rounded-2xl`}>
            <h3 className={`text-2xl font-bold mb-6 ${theme.textPrimary}`}>
              Hidden Content (VAssist sees this)
            </h3>

            <div className="mb-8">
              <h4 className={`text-xl font-semibold mb-4 ${theme.textPrimary}`}>Weather Forecast</h4>
              <table className={`w-full ${isDark ? 'text-white' : 'text-slate-900'}`}>
                <thead className={isDark ? 'bg-white/10' : 'bg-slate-100'}>
                  <tr>
                    <th className="px-4 py-3 text-left">Day</th>
                    <th className="px-4 py-3 text-left">Condition</th>
                    <th className="px-4 py-3 text-left">Temp</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className={isDark ? 'border-t border-white/10' : 'border-t'}>
                    <td className="px-4 py-3">Monday</td>
                    <td className="px-4 py-3">Sunny</td>
                    <td className="px-4 py-3">75°F / 55°F</td>
                  </tr>
                  <tr className={isDark ? 'border-t border-white/10' : 'border-t'}>
                    <td className="px-4 py-3">Tuesday</td>
                    <td className="px-4 py-3">Cloudy</td>
                    <td className="px-4 py-3">72°F / 58°F</td>
                  </tr>
                  <tr className={isDark ? 'border-t border-white/10' : 'border-t'}>
                    <td className="px-4 py-3">Wednesday</td>
                    <td className="px-4 py-3">Rainy</td>
                    <td className="px-4 py-3">65°F / 52°F</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="mb-8">
              <h4 className={`text-xl font-semibold mb-4 ${theme.textPrimary}`}>Links</h4>
              <div className="space-y-2">
                <a href="https://github.com" className={`block ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>GitHub</a>
                <a href="https://react.dev" className={`block ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>React Docs</a>
                <a href="https://developer.mozilla.org" className={`block ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>MDN</a>
              </div>
            </div>

            <div className="mb-8">
              <h4 className={`text-xl font-semibold mb-4 ${theme.textPrimary}`}>Contact Form</h4>
              <form className="space-y-3">
                <input type="text" placeholder="Name" className={`w-full px-4 py-2 rounded ${isDark ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200'} border`} />
                <input type="email" placeholder="Email" className={`w-full px-4 py-2 rounded ${isDark ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200'} border`} />
                <textarea placeholder="Message" rows={3} className={`w-full px-4 py-2 rounded ${isDark ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200'} border`} />
              </form>
            </div>

            <div className="mb-8">
              <h4 className={`text-xl font-semibold mb-4 ${theme.textPrimary}`}>Code Example</h4>
              <pre className={`p-4 rounded ${isDark ? 'bg-black/30' : 'bg-slate-900'} overflow-x-auto`}>
                <code className="text-sm">
{`// React Component with Custom Hook
function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    
    return () => clearTimeout(handler);
  }, [value, delay]);
  
  return debouncedValue;
}

// Usage in Search Component
function SearchBar() {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 500);
  
  useEffect(() => {
    if (debouncedSearch) {
      fetchResults(debouncedSearch);
    }
  }, [debouncedSearch]);
  
  return <input value={search} onChange={(e) => setSearch(e.target.value)} />;
}`}
                </code>
              </pre>
            </div>

            <div>
              <h4 className={`text-xl font-semibold mb-4 ${theme.textPrimary}`}>Article</h4>
              <p className={theme.textSecondary}>
                AI assistants are revolutionizing web browsing. They can extract data, summarize content, 
                and help with complex tasks without manual copy-pasting.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default DocumentInteractionDemo;
