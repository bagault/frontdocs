<template>
  <div v-if="!root" class="file-tree-node">
    <div
      v-if="node.is_dir"
      class="tree-item tree-folder"
      @click="expanded = !expanded"
    >
      <v-icon size="18" class="mr-1">
        {{ expanded ? 'mdi-chevron-down' : 'mdi-chevron-right' }}
      </v-icon>
      <v-icon size="18" class="mr-2" color="primary">
        {{ expanded ? 'mdi-folder-open' : 'mdi-folder' }}
      </v-icon>
      <span class="text-body-2 text-truncate">{{ node.name }}</span>
    </div>

    <div
      v-else
      class="tree-item tree-file"
      :class="{ active: selectedPath === node.path }"
      @click="$emit('select', node.path)"
    >
      <v-icon size="18" class="mr-2 ml-5" color="info">mdi-language-markdown</v-icon>
      <span class="text-body-2 text-truncate">{{ node.name }}</span>
    </div>
  </div>

  <div v-if="node.is_dir && (expanded || root)" class="tree-children" :class="{ 'ml-2': !root }">
    <FileTree
      v-for="child in node.children"
      :key="child.path"
      :node="child"
      :selected-path="selectedPath"
      :root="false"
      @select="(path: string) => $emit('select', path)"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { FileTreeNode } from '../../types';

const props = defineProps<{
  node: FileTreeNode;
  selectedPath?: string;
  root?: boolean;
}>();

defineEmits<{
  select: [path: string];
}>();

const expanded = ref(true);
</script>

<style scoped>
.tree-item {
  display: flex;
  align-items: center;
  padding: 4px 8px;
  border-radius: 6px;
  cursor: pointer;
  user-select: none;
  transition: background-color 0.15s ease;
}
.tree-item:hover {
  background: rgba(255, 255, 255, 0.05);
}
.tree-item.active {
  background: rgba(0, 0, 140, 0.25);
}
.tree-children {
  border-left: 1px solid rgba(255, 255, 255, 0.06);
}
</style>
