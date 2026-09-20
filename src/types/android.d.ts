import type { AndroidAPI } from "./android";

declare global {
  interface Window {
    AndroidAI?: AndroidAPI;
  }
}

export {};
