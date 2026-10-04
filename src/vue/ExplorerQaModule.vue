<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = defineProps({
  modulePath: { type: String, default: '/qa-app/' },
  locale: { type: String, default: 'zh' },
  dark: { type: Boolean, default: false },
  color: { type: String, default: 'blue' },
});
const emit = defineEmits(['ready', 'preferences']);
const ready = ref(false);
const src = computed(() => {
  if (props.modulePath === '/') return '/?embed=1';
  if (!/^\/(?:[a-z0-9][a-z0-9_-]*)(?:\/[a-z0-9][a-z0-9_-]*)*\/?$/u.test(props.modulePath)) throw Error('Same-origin module path required');
  return `${props.modulePath.replace(/\/$/u, '')}/?embed=1`;
});

const frame = ref(null);
const send = (type, values = {}) => frame.value?.contentWindow?.postMessage({ ...values, type, version: 1 }, window.location.origin);
const syncPreferences = () => send('explorer-qa:preferences', { locale: props.locale, dark: props.dark, color: props.color });
const receive = event => {
  if (event.source !== frame.value?.contentWindow || event.origin !== window.location.origin || event.data?.version !== 1) return;
  if (event.data.type === 'explorer-qa:ready') {
    ready.value = true;
    syncPreferences();
    emit('ready');
  } else if (event.data.type === 'explorer-qa:preferences') {
    const { locale, dark, color } = event.data;
    if (['zh', 'en'].includes(locale) && typeof dark === 'boolean' && ['blue', 'teal', 'graphite'].includes(color)) {
      emit('preferences', { locale, dark, color });
    }
  }
};
onMounted(() => window.addEventListener('message', receive));
onBeforeUnmount(() => window.removeEventListener('message', receive));
watch(() => [props.locale, props.dark, props.color], () => { if (ready.value) syncPreferences(); });
watch(src, () => { ready.value = false; });

defineExpose({
  newConversation: () => { if (ready.value) send('explorer-qa:new'); },
  openHistory: () => { if (ready.value) send('explorer-qa:history'); },
  openOptions: () => { if (ready.value) send('explorer-qa:more'); },
  ready,
});
</script>

<template>
  <iframe
    ref="frame"
    class="explorer-qa-module"
    :src="src"
    @load="send('explorer-qa:hello')"
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
