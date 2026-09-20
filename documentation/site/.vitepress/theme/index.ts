import DefaultTheme from "vitepress/theme";
import type { Theme } from "vitepress";
import { h } from "vue";
import VAssistDocsDemo from "./components/VAssistDocsDemo.vue";
import "./custom.css";

const theme: Theme = {
  extends: DefaultTheme,
  Layout: () =>
    h(DefaultTheme.Layout, null, {
      "layout-bottom": () => h(VAssistDocsDemo),
    }),
};

export default theme;
