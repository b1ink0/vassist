<script setup lang="ts">
import { onBeforeUnmount, onMounted } from "vue";

const hostId = "vassist-docs-demo";
let removeEmbed: ((hostId?: string) => void) | null = null;

onMounted(() => {
  void (async () => {
    try {
      const { injectFullVAssistEmbed, removeVAssistEmbed } = await import(
        "@vassist/embed/full"
      );

      removeEmbed = removeVAssistEmbed;

      removeVAssistEmbed();
      removeVAssistEmbed(hostId);

      injectFullVAssistEmbed({
        target: document.body,
        hostId,
        config: {
          mount: {
            hostId,
            runtimeIsolation: "shadow-root",
          },
          storage: {
            mode: "namespaced",
            namespace: "vitepress-docs",
          },
          shell: {
            deferSetupUntilStarted: true,
          },
          theme: {
            mode: "dark",
            effects: {
              enableAmbientOverlay: false,
            },
          },
        },
      });
    } catch (error) {
      console.error("[VAssist Docs] Failed to inject assistant", error);
    }
  })();
});

onBeforeUnmount(() => {
  removeEmbed?.();
  removeEmbed?.(hostId);
});
</script>

<template></template>
