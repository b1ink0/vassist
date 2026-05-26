/**
 * @fileoverview Application entry point.
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { prepareVAssistTestRuntime } from "./testing/testBridge";
import { isVAssistTestMode } from "./testing/runtime";

const renderApp = () => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
};

const bootstrapApp = async () => {
  if (isVAssistTestMode) {
    document.documentElement.dataset.vassistTestMode = "true";
    await prepareVAssistTestRuntime();
  }

  renderApp();
};

void bootstrapApp();
