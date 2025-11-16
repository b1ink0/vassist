// @ts-check

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

/**
 * Creating a sidebar enables you to:
 - create an ordered group of docs
 - render a sidebar for each doc of that group
 - provide next/previous navigation

 The sidebars can be generated from the filesystem, or explicitly defined here.

 Create as many sidebars as you want.

 @type {import('@docusaurus/plugin-content-docs').SidebarsConfig}
 */
const sidebars = {
  tutorialSidebar: [
    'intro',
    'installation',
    {
      type: 'category',
      label: 'Features',
      items: [
        'features/toolbar',
        'features/chat',
        'features/companion',
      ],
    },
    {
      type: 'category',
      label: 'Configuration',
      items: [
        'configuration/settings',
        'configuration/ui-settings',
        'configuration/llm-settings',
        'configuration/tts-settings',
        'configuration/stt-settings',
        'configuration/ai-features',
        'configuration/shortcuts',
      ],
    },
  ],
};

export default sidebars;
