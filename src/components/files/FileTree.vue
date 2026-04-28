<template>
  <div v-if="!root" class="file-tree-node">
    <div
      v-if="node.is_dir"
      class="tree-item tree-folder"
      :class="{ 'drag-over': isDragOver }"
      draggable="true"
      @click="expanded = !expanded"
      @dragstart="onDragStart"
      @dragover.prevent="onDragOver"
      @dragleave="onDragLeave"
      @drop.prevent="onDrop"
      @contextmenu.prevent="openContextMenu"
    >
      <v-icon size="18" class="mr-1">
        {{ expanded ? 'mdi-chevron-down' : 'mdi-chevron-right' }}
      </v-icon>
      <v-icon size="18" class="mr-2" color="primary">
        {{ expanded ? 'mdi-folder-open' : 'mdi-folder' }}
      </v-icon>
      <span class="text-body-2 text-truncate flex-grow-1">{{ node.name }}</span>
      <v-menu offset-y>
        <template #activator="{ props }">
          <v-btn
            icon
            size="x-small"
            variant="text"
            class="tree-action"
            v-bind="props"
            @click.stop
          >
            <v-icon size="16">mdi-dots-vertical</v-icon>
          </v-btn>
        </template>
        <v-list density="compact">
          <v-list-item @click="requestCreateFolder" prepend-icon="mdi-folder-plus">
            <v-list-item-title>New Folder</v-list-item-title>
          </v-list-item>
          <v-divider />
          <v-list-item @click="$emit('requestDelete', node)" prepend-icon="mdi-delete">
            <v-list-item-title class="text-error">Delete</v-list-item-title>
          </v-list-item>
        </v-list>
      </v-menu>
    </div>

    <div
      v-else
      class="tree-item tree-file"
      :class="{ active: selectedPath === node.path }"
      draggable="true"
      @click="$emit('select', node.path)"
      @dragstart="onDragStart"
    >
      <v-icon size="18" class="mr-2 ml-5" color="info">mdi-language-markdown</v-icon>
      <span class="text-body-2 text-truncate flex-grow-1">{{ node.name }}</span>
      <v-btn
        icon
        size="x-small"
        variant="text"
        class="tree-action"
        @click.stop="$emit('requestDelete', node)"
      >
        <v-icon size="16" color="error">mdi-delete-outline</v-icon>
      </v-btn>
    </div>
  </div>

  <!-- Root folder acts as a drop target too -->
  <div
    v-if="node.is_dir && (expanded || root)"
    class="tree-children"
    :class="{ 'ml-2': !root, 'drag-over': root && isDragOver }"
    @dragover.prevent="root ? onDragOver($event) : undefined"
    @dragleave="root ? onDragLeave($event) : undefined"
    @drop.prevent="root ? onDrop($event) : undefined"
  >
    <FileTree
      v-for="child in node.children"
      :key="child.path"
      :node="child"
      :selected-path="selectedPath"
      :root="false"
      @select="(path: string) => $emit('select', path)"
      @move="(source: string, dest: string) => $emit('move', source, dest)"
      @request-delete="(n: any) => $emit('requestDelete', n)"
      @request-create-folder="(path: string) => $emit('requestCreateFolder', path)"
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

const emit = defineEmits<{
  select: [path: string];
  move: [source: string, destination: string];
  requestDelete: [node: FileTreeNode];
  requestCreateFolder: [path: string];
}>();

const expanded = ref(true);
const isDragOver = ref(false);

function onDragStart(event: DragEvent) {
  if (event.dataTransfer) {
    event.dataTransfer.setData('text/plain', props.node.path);
    event.dataTransfer.effectAllowed = 'move';
  }
}

function onDragOver(event: DragEvent) {
  if (props.node.is_dir) {
    isDragOver.value = true;
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  }
}

function onDragLeave(_event: DragEvent) {
  isDragOver.value = false;
}

function onDrop(event: DragEvent) {
  isDragOver.value = false;
  if (!props.node.is_dir || !event.dataTransfer) return;

  const sourcePath = event.dataTransfer.getData('text/plain');
  if (!sourcePath || sourcePath === props.node.path) return;

  // Don't drop a folder into itself (normalize for cross-platform)
  const normalizedNode = props.node.path.replace(/\\/g, '/');
  const normalizedSource = sourcePath.replace(/\\/g, '/');
  if (normalizedNode.startsWith(normalizedSource + '/')) return;

  // Extract filename from source path
  const parts = normalizedSource.split('/');
  const fileName = parts[parts.length - 1];
  const destPath = normalizedNode + '/' + fileName;

  if (sourcePath !== destPath) {
    emit('move', sourcePath, destPath);
  }
}

function openContextMenu(event: MouseEvent) {
  // This would be handled by the v-menu,  but we can use it for additional logic if needed
}

function requestCreateFolder() {
  emit('requestCreateFolder', props.node.path);
}
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
.tree-item.drag-over {
  background: rgba(92, 124, 250, 0.2);
  outline: 1px dashed rgba(92, 124, 250, 0.5);
}
.tree-children {
  border-left: 1px solid rgba(255, 255, 255, 0.06);
}
.tree-children.drag-over {
  background: rgba(92, 124, 250, 0.1);
}
.tree-action {
  opacity: 0;
  transition: opacity 0.15s ease;
}
.tree-item:hover .tree-action {
  opacity: 0.7;
}
.tree-action:hover {
  opacity: 1 !important;
}
</style>
