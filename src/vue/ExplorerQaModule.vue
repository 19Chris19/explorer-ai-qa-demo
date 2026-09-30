<script setup>
import { ref } from 'vue';

const frame = ref(null);
const send = type => frame.value?.contentWindow?.postMessage({ type }, window.location.origin);

defineExpose({
  newConversation: () => send('explorer-qa:new'),
  openHistory: () => send('explorer-qa:history'),
  openOptions: () => send('explorer-qa:more'),
});
</script>

<template>
  <iframe
    ref="frame"
    class="explorer-qa-module"
    src="/qa-app/?embed=1"
    title="知天下 AI 问答"
    loading="eager"
  />
</template>

<style scoped>
.explorer-qa-module {
  display: block;
  width: 100%;
  min-width: 0;
  height: 100%;
  min-height: 520px;
  border: 0;
  background: #fff;
}
</style>
