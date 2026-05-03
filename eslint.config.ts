import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

const generatedIgnores = [
  "node_modules/**",
  ".git/**",
  ".github/**",
  "build/**",
  "dist/**",
  "dist-*/**",
  "dist-ssr/**",
  "release/**",
  ".docusaurus/**",
  ".vscode/**",
  ".tmp/**",
  ".tmp-asar-scan/**",
  "coverage/**",
  ".next/**",
  "docs/**",
  "public/**",
  "assets/**",
  "public/res/**",
  "assets/res/**",
  "res/**",
  "android/.gradle/**",
  "android/.idea/**",
  "android/app/src/main/assets/**",
  "android/llama/.cxx/**",
  "android/**/build/**",
  "android/capacitor-cordova-android-plugins/**",
  "electron/server/gpt-sovits/**",
  "electron/server/models/**",
  "electron/server/whisper-stt/models/**",
  "models/**",
  "**/assets/**",
];

const tsFiles = ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"];

const tsRecommendedConfigs = tseslint.configs.recommended.map((config) => {
  const typedConfig = config as typeof config & { files?: string[] };

  return {
    ...typedConfig,
    files: typedConfig.files ?? tsFiles,
  };
});

const sharedGlobals = {
  ...globals.browser,
  ...globals.node,
  chrome: "readonly",
  // Build-time constants injected by Vite
  __EXTENSION_MODE__: "readonly",
  __DESKTOP_MODE__: "readonly",
  __DEV_MODE__: "readonly",
};

export default defineConfig([
  globalIgnores(generatedIgnores),
  {
    files: ["**/*.{js,jsx,mjs,cjs}"],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: "latest",
      globals: {
        ...sharedGlobals,
      },
      parserOptions: {
        ecmaVersion: "latest",
        ecmaFeatures: { jsx: true },
        sourceType: "module",
      },
    },
    rules: {
      "no-unused-vars": ["error", { varsIgnorePattern: "^[A-Z_]" }],
    },
  },
  ...tsRecommendedConfigs,
  {
    files: tsFiles,
    languageOptions: {
      ecmaVersion: "latest",
      globals: {
        ...sharedGlobals,
      },
      parserOptions: {
        ecmaVersion: "latest",
        ecmaFeatures: { jsx: true },
        sourceType: "module",
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-this-alias": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          ignoreRestSiblings: true,
          varsIgnorePattern: "^[A-Z_]",
        },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "warn",
        {
          prefer: "type-imports",
          fixStyle: "separate-type-imports",
          disallowTypeAnnotations: false,
        },
      ],
    },
  },
  {
    files: ["**/*.{jsx,tsx}"],
    extends: [
      reactHooks.configs["recommended-latest"],
      reactRefresh.configs.vite,
    ],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
  eslintConfigPrettier,
]);
