import clsx from 'clsx';
import Heading from '@theme/Heading';
import styles from './styles.module.css';

const FeatureList = [
  {
    title: '🎯 AI Toolbar',
    description: (
      <>
        Select any text on any website and access powerful AI tools: summarize, translate, rewrite, grammar fix, tone change, image analysis, and voice dictation.
      </>
    ),
  },
  {
    title: '💬 Chat Interface',
    description: (
      <>
        Natural conversations with AI about any page. Supports image/audio attachments, voice mode, chat history with branching, and smooth word-by-word animations.
      </>
    ),
  },
  {
    title: '✨ Virtual Companion',
    description: (
      <>
        Animated character that appears on pages with different states (idle, thinking, speaking) and lip-synced speech.
      </>
    ),
  },
];

function Feature({title, description}) {
  return (
    <div className={clsx('col col--4')}>
      <div className="text--center padding-horiz--md">
        <Heading as="h3">{title}</Heading>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures() {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
