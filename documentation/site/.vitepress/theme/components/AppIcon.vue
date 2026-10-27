<script setup lang="ts">
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { computed } from "vue";
import { iconMap } from "../../../../../src/components/icons/iconMap";

const props = defineProps<{
  name: keyof typeof iconMap;
  size?: number;
}>();

const svg = computed(() => {
  const Icon = iconMap[props.name];
  const size = props.size ?? 20;

  return renderToStaticMarkup(
    createElement(Icon, {
      "aria-hidden": true,
      style: {
        display: "inline-block",
        width: size,
        height: size,
        verticalAlign: "-0.3em",
      },
    }),
  );
});
</script>

<template>
  <span class="app-icon" aria-hidden="true" v-html="svg" />
</template>
