<template>
  <div class="editor-wrapper">
    <textarea
      ref="textarea"
      class="editor-area"
      :value="modelValue"
      @input="handleInput"
      @keydown.tab.prevent="handleTab"
      spellcheck="false"
      placeholder="Start writing Markdown..."
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const props = defineProps<{
  modelValue: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
  save: [];
}>();

const textarea = ref<HTMLTextAreaElement | null>(null);

function handleInput(e: Event) {
  const target = e.target as HTMLTextAreaElement;
  emit('update:modelValue', target.value);
}

function handleTab(e: KeyboardEvent) {
  const el = textarea.value;
  if (!el) return;
  const start = el.selectionStart;
  const end = el.selectionEnd;
  const value = el.value;

  emit('update:modelValue', value.substring(0, start) + '  ' + value.substring(end));

  requestAnimationFrame(() => {
    el.selectionStart = el.selectionEnd = start + 2;
  });
}
</script>

<style scoped>
.editor-wrapper {
  position: relative;
  flex: 1 1 0;
  min-height: 0;
}
</style>
