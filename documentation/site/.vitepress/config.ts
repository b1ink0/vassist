import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitepress";
import { vadAssetsPlugin } from "../../../tools/vite-plugins/vad-assets-plugin";

const base = process.env.VASSIST_DOCS_BASE ?? "/";
const currentDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  title: "VAssist",
  description:
    "Guides for installing, setting up, and using VAssist on desktop, Android, and the browser extension.",
  base,
  appearance: "force-dark",
  cleanUrls: true,
  lastUpdated: true,
  ignoreDeadLinks: true,
  themeConfig: {
    logo: "/VA.svg",
    siteTitle: "VAssist Docs",
    search: {
      provider: "local",
    },
    nav: [
      { text: "Getting Started", link: "/intro" },
      { text: "Use VAssist", link: "/guide/" },
      { text: "Settings", link: "/settings/" },
      { text: "Platforms", link: "/platforms/desktop" },
      { text: "Technical", link: "/architecture/overview" },
    ],
    sidebar: {
      "/getting-started/": [
        {
          text: "Getting Started",
          items: [
            { text: "Start Here", link: "/intro" },
            { text: "Install", link: "/getting-started/installation" },
            { text: "Set Up", link: "/getting-started/setup-wizard" },
            { text: "Use VAssist", link: "/guide/" },
          ],
        },
      ],
      "/guide/": [
        {
          text: "Use VAssist",
          items: [{ text: "Overview", link: "/guide/" }],
        },
        {
          text: "Chat and Input",
          items: [
            { text: "Chat and Voice", link: "/guide/chat-and-voice" },
            {
              text: "Saved Chats and Branches",
              link: "/guide/chat-history-and-branches",
            },
            {
              text: "Camera and Screen Share",
              link: "/guide/camera-and-screen-share",
            },
          ],
        },
        {
          text: "On-Page Tools",
          items: [
            { text: "AI Toolbar", link: "/guide/ai-toolbar" },
            { text: "Page Context", link: "/guide/page-context" },
          ],
        },
        {
          text: "Live Assistant",
          items: [
            { text: "Live Assistant", link: "/guide/virtual-companion" },
            {
              text: "Avatar, Motions, and Emotes",
              link: "/guide/avatar-motions-and-emotes",
            },
          ],
        },
      ],
      "/settings/": [
        {
          text: "Settings Reference",
          items: [{ text: "Overview", link: "/settings/" }],
        },
        {
          text: "Interface and Live Assistant",
          items: [
            { text: "UI", link: "/settings/ui" },
            { text: "3D", link: "/settings/three-d" },
          ],
        },
        {
          text: "AI and Voice",
          items: [
            { text: "LLM", link: "/settings/llm" },
            { text: "TTS", link: "/settings/tts" },
            { text: "STT", link: "/settings/stt" },
            { text: "AI Features", link: "/settings/ai-features" },
          ],
        },
      ],
      "/platforms/": [
        {
          text: "Choose a Platform",
          items: [
            { text: "Desktop", link: "/platforms/desktop" },
            { text: "Android", link: "/platforms/android" },
            { text: "Extension", link: "/platforms/extension" },
          ],
        },
      ],
      "/architecture/": [
        {
          text: "Technical Reference",
          items: [
            { text: "Overview", link: "/architecture/overview" },
            {
              text: "AI and Media Stack",
              link: "/architecture/ai-and-media-stack",
            },
            {
              text: "Storage and Data",
              link: "/architecture/storage-and-data",
            },
            { text: "Repository Map", link: "/architecture/repository-map" },
            {
              text: "Repository Tree and Metrics",
              link: "/architecture/repository-tree",
            },
          ],
        },
        {
          text: "Integration",
          items: [
            {
              text: "Overview",
              link: "/architecture/packages-and-integration",
            },
            {
              text: "@vassist/embed",
              link: "/architecture/embed",
            },
            {
              text: "@vassist/react",
              link: "/architecture/react",
            },
            {
              text: "Configuration Reference",
              link: "/architecture/configuration-reference",
            },
          ],
        },
      ],
      "/": [
        {
          text: "Getting Started",
          items: [
            { text: "Start Here", link: "/intro" },
            { text: "Install", link: "/getting-started/installation" },
            { text: "Set Up", link: "/getting-started/setup-wizard" },
            { text: "Use VAssist", link: "/guide/" },
          ],
        },
      ],
    },
    outline: {
      level: [2, 3],
    },
    socialLinks: [
      { icon: "github", link: "https://github.com/b1ink0/vassist" },
    ],
    footer: {
      copyright: "VAssist",
    },
  },
  head: [
    ["link", { rel: "shortcut icon", href: "/favicon.ico" }],
    ["link", { rel: "icon", type: "image/svg+xml", href: "/VA.svg" }],
    ["meta", { name: "theme-color", content: "#050505" }],
    ["meta", { property: "og:title", content: "VAssist Documentation" }],
  ],
  vite: {
    plugins: [
      react(),
      tailwindcss(),
      vadAssetsPlugin("documentation/site/.vitepress/dist"),
    ],
    resolve: {
      dedupe: ["react", "react-dom"],
      preserveSymlinks: true,
    },
    optimizeDeps: {
      force: true,
      exclude: [
        "@vassist/embed",
        "@vassist/embed/full",
        "@vassist/embed/chat",
        "@vassist/embed/chat-toolbar",
        "@vassist/embed/toolbar",
        "@vassist/react",
        "@vassist/react/full",
        "@vassist/react/chat",
        "@vassist/react/chat-toolbar",
        "@vassist/react/toolbar",
        "@huggingface/transformers",
        "onnxruntime-common",
        "onnxruntime-web",
      ],
    },
    define: {
      __ANDROID_MODE__: false,
      __EXTENSION_MODE__: false,
      __DESKTOP_MODE__: false,
      __DEV_MODE__: process.env.NODE_ENV !== "production",
      __EMBED_MODE__: true,
      __PROD_MODE__: process.env.NODE_ENV === "production",
    },
  },
});
