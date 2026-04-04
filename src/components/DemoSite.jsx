import { useApp } from '../contexts/AppContext';
import { Icon } from './icons';
import logoSvg from '../assets/VA.svg';

const platformCards = [
  {
    title: 'Browser Extension',
    subtitle: 'Always-on assistant for the web',
    body: 'Bring chat, writing help, translation, and quick actions into the pages you already use.'
  },
  {
    title: 'Android App',
    subtitle: 'On-device companion',
    body: 'Run local models and voice workflows directly on your phone with a clean, focused interface.'
  },
  {
    title: 'Desktop App',
    subtitle: 'Power mode for daily work',
    body: 'Use local pipelines, larger context, and full control from a dedicated desktop environment.'
  }
];

const capabilityRows = [
  {
    label: 'Avatar + Chat',
    value: 'Animated companion with persistent chat workflows'
  },
  {
    label: 'AI Toolbar',
    value: 'Page actions for summarize, rewrite, translate, and contextual helpers'
  },
  {
    label: 'Voice',
    value: 'Speech-to-text and text-to-speech pipelines with provider control'
  },
  {
    label: 'Local Runtime',
    value: 'Android and desktop local model paths with platform defaults'
  },
  {
    label: 'Setup + Config',
    value: 'Guided setup and deep settings for model, UI, voice, and behavior'
  }
];

const principles = [
  'One assistant identity across extension, Android, and desktop.',
  'Local-first by default on native platforms.',
  'Fast interaction loop for browsing and task execution.',
  'Minimal, intentional interface focused on usability.'
];

const sectionClass =
  'max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20 border-t border-white/10';

const DemoSite = ({ onLaunchAssistant }) => {
  const { openChat } = useApp();

  const handlePrimaryAction = () => {
    if (onLaunchAssistant) {
      onLaunchAssistant();
      return;
    }
    openChat?.();
  };

  return (
    <div
      className="absolute inset-0 overflow-auto bg-black text-white"
      style={{ fontFamily: '"Space Grotesk", "IBM Plex Sans", system-ui, sans-serif' }}
    >
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.08),transparent_35%),radial-gradient(circle_at_80%_10%,rgba(255,255,255,0.05),transparent_30%),radial-gradient(circle_at_50%_80%,rgba(255,255,255,0.04),transparent_35%)]" />

      <header className="sticky top-0 z-30 border-b border-white/10 bg-black/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logoSvg} alt="VAssist" className="w-9 h-9 object-contain" />
            <div>
              <p className="text-sm font-semibold tracking-[0.08em] uppercase text-white/90">VAssist</p>
              <p className="text-[11px] text-white/60">AI companion for web, Android, and desktop</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href="https://github.com/b1ink0/vassist/releases"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 text-xs sm:text-sm rounded-md border border-white/20 text-white/90 hover:bg-white/10 transition-colors"
            >
              <span className="inline-flex items-center gap-1.5">
                <Icon name="github" size={14} />
                <span>Releases</span>
              </span>
            </a>
            <button
              onClick={handlePrimaryAction}
              className="px-3 py-1.5 text-xs sm:text-sm rounded-md bg-white text-black font-semibold hover:bg-white/85 transition-colors"
            >
              Open Chat
            </button>
          </div>
        </div>
      </header>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 sm:pt-24 pb-14 sm:pb-20">
        <div className="max-w-4xl">
          <p className="inline-flex items-center px-3 py-1 text-[11px] tracking-[0.12em] uppercase rounded-full border border-white/20 bg-white/5 text-white/80">
            Assistant that runs where you work
          </p>

          <h1 className="mt-6 text-4xl sm:text-6xl lg:text-7xl font-semibold leading-[0.95] tracking-[-0.02em]">
            VAssist helps you read, write,
            <br />
            speak, and act faster.
          </h1>

          <p className="mt-6 text-base sm:text-xl text-white/75 max-w-3xl leading-relaxed">
            Open chat instantly, use page-level AI tools, run local-native flows on Android/Desktop,
            and tune behavior from a complete settings stack.
          </p>

          <div className="mt-9 flex flex-wrap gap-3">
            <button
              onClick={handlePrimaryAction}
              className="px-5 py-2.5 rounded-lg bg-white text-black font-semibold hover:bg-white/85 transition-colors"
            >
              Open Chat
            </button>
            <a
              href="#platforms"
              className="px-5 py-2.5 rounded-lg border border-white/25 text-white/90 hover:bg-white/10 transition-colors"
            >
              Explore Platforms
            </a>
          </div>
        </div>
      </section>

      <section id="platforms" className={sectionClass}>
        <div className="flex items-end justify-between gap-4 mb-8">
          <h2 className="text-2xl sm:text-4xl font-semibold tracking-[-0.01em]">Platform Surfaces</h2>
          <span className="text-xs uppercase tracking-[0.14em] text-white/45">Three runtimes</span>
        </div>

        <div className="grid md:grid-cols-3 gap-4 sm:gap-6">
          {platformCards.map((card) => (
            <article
              key={card.title}
              className="rounded-2xl border border-white/15 bg-white/[0.03] p-5 sm:p-6 hover:bg-white/[0.06] transition-colors"
            >
              <p className="text-xs uppercase tracking-[0.12em] text-white/45">{card.subtitle}</p>
              <h3 className="mt-2 text-xl font-semibold text-white">{card.title}</h3>
              <p className="mt-3 text-sm sm:text-base text-white/70 leading-relaxed">{card.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={sectionClass}>
        <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-8 sm:gap-10 items-start">
          <div>
            <h2 className="text-2xl sm:text-4xl font-semibold tracking-[-0.01em]">What You Actually Get</h2>
            <p className="mt-4 text-white/70 max-w-2xl">
              Core capabilities shipped in this codebase and tuned for daily usage.
            </p>

            <div className="mt-8 border border-white/15 rounded-2xl overflow-hidden">
              {capabilityRows.map((row, idx) => (
                <div
                  key={row.label}
                  className={`grid grid-cols-[140px_1fr] sm:grid-cols-[180px_1fr] gap-4 p-4 sm:p-5 ${
                    idx < capabilityRows.length - 1 ? 'border-b border-white/10' : ''
                  }`}
                >
                  <p className="text-white/50 text-xs sm:text-sm uppercase tracking-[0.12em]">{row.label}</p>
                  <p className="text-white/85 text-sm sm:text-base">{row.value}</p>
                </div>
              ))}
            </div>
          </div>

          <aside className="rounded-2xl border border-white/15 bg-white/[0.03] p-5 sm:p-6">
            <h3 className="text-lg sm:text-xl font-semibold">Project Principles</h3>
            <ul className="mt-4 space-y-3">
              {principles.map((point) => (
                <li key={point} className="text-sm sm:text-base text-white/75 leading-relaxed flex gap-3">
                  <span className="mt-2 w-1.5 h-1.5 rounded-full bg-white/70 flex-shrink-0" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </section>

      <section className={sectionClass}>
        <div className="rounded-3xl border border-white/20 bg-white/[0.04] p-6 sm:p-10">
          <div className="grid lg:grid-cols-[1.2fr_0.8fr] gap-8 items-start">
            <div>
              <h2 className="text-2xl sm:text-4xl font-semibold tracking-[-0.01em]">Use It Like a Daily Tool</h2>
              <p className="mt-4 text-white/72 max-w-2xl leading-relaxed">
                This is an actively developed project with polished setup, platform-aware defaults,
                local-first options, and one consistent assistant workflow.
              </p>

              <div className="mt-7 flex flex-wrap gap-3">
                <button
                  onClick={handlePrimaryAction}
                  className="px-5 py-2.5 rounded-lg bg-white text-black font-semibold hover:bg-white/85 transition-colors"
                >
                  Open Chat
                </button>
                <a
                  href="https://github.com/b1ink0/vassist"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-5 py-2.5 rounded-lg border border-white/25 text-white/90 hover:bg-white/10 transition-colors"
                >
                  <span className="inline-flex items-center gap-2">
                    <Icon name="github" size={16} />
                    <span>View Repository</span>
                  </span>
                </a>
              </div>
            </div>

            <div className="rounded-2xl border border-white/15 p-4 sm:p-5">
              <p className="text-xs uppercase tracking-[0.12em] text-white/50">Quick Start</p>
              <ol className="mt-3 space-y-3 text-sm text-white/80">
                <li className="pb-3 border-b border-white/10">1. Pick your platform build.</li>
                <li className="pb-3 border-b border-white/10">2. Run setup and keep local defaults where available.</li>
                <li>3. Start with chat, then layer voice and toolbar workflows.</li>
              </ol>
            </div>
          </div>
        </div>
      </section>

      <footer className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 border-t border-white/10">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-sm text-white/60">
          <p>VAssist</p>
          <p>Built for real work.</p>
        </div>
      </footer>
    </div>
  );
};

export default DemoSite;
