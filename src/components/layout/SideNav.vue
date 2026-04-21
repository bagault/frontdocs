<template>
  <v-navigation-drawer
    v-model="appStore.sideNavOpen"
    width="280"
    color="surface"
    permanent
    floating
  >
    <div class="d-flex flex-column fill-height">
      <!-- Workspace info -->
      <div class="px-4 py-3" style="border-bottom: 1px solid var(--fd-border)">
        <div class="text-caption text-medium-emphasis mb-1">WORKSPACE</div>
        <div class="text-body-2 font-weight-medium text-truncate">
          {{ workspaceName }}
        </div>
        <div class="text-caption text-medium-emphasis">
          {{ appStore.files.length }} markdown file{{ appStore.files.length !== 1 ? 's' : '' }}
        </div>
      </div>

      <!-- Actions -->
      <div class="px-3 py-2 d-flex gap-1" style="border-bottom: 1px solid var(--fd-border)">
        <v-btn
          size="small"
          variant="tonal"
          color="primary"
          prepend-icon="mdi-file-plus-outline"
          @click="showNewFile = true"
          block
        >
          New Page
        </v-btn>
      </div>

      <!-- File tree -->
      <div class="flex-grow-1 overflow-y-auto pa-2">
        <FileTree
          v-if="appStore.fileTree"
          :node="appStore.fileTree"
          :selected-path="appStore.currentFile?.path"
          :root="true"
          @select="handleFileSelect"
          @move="handleMove"
          @request-delete="handleRequestDelete"
          @request-create-folder="handleRequestCreateFolder"
        />
        <div v-else class="text-center pa-4 text-medium-emphasis">
          <v-icon size="48" class="mb-2">mdi-file-tree-outline</v-icon>
          <div class="text-body-2">No files found</div>
        </div>
      </div>
    </div>

    <!-- New file dialog -->
    <v-dialog v-model="showNewFile" max-width="440">
      <v-card>
        <v-card-title class="text-h6">New Markdown Page</v-card-title>
        <v-card-text>
          <v-text-field
            v-model="newFileName"
            label="File name"
            suffix=".md"
            placeholder="my-new-page"
            autofocus
            @keydown.enter="createNewFile"
          />
          <v-select
            v-model="newFileTemplate"
            label="Template"
            :items="templates"
            item-title="label"
            item-value="value"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showNewFile = false">Cancel</v-btn>
          <v-btn color="primary" @click="createNewFile" :disabled="!newFileName.trim()">
            Create
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- New folder dialog -->
    <v-dialog v-model="showNewFolder" max-width="440">
      <v-card>
        <v-card-title class="text-h6">New Folder</v-card-title>
        <v-card-text>
          <v-text-field
            v-model="newFolderName"
            label="Folder name"
            placeholder="my-new-folder"
            autofocus
            @keydown.enter="createNewFolder"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showNewFolder = false">Cancel</v-btn>
          <v-btn color="primary" @click="createNewFolder" :disabled="!newFolderName.trim()">
            Create
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Delete confirmation dialog -->
    <v-dialog v-model="showDeleteDialog" max-width="440">
      <v-card>
        <v-card-title class="text-h6">
          Delete {{ deleteTarget?.is_dir ? 'Folder' : 'File' }}
        </v-card-title>
        <v-card-text>
          <p>
            Are you sure you want to permanently delete
            <strong>{{ deleteTarget?.name }}</strong>{{ deleteTarget?.is_dir ? ' and all its contents' : '' }}?
          </p>
          <p class="text-caption text-error mt-2">This action cannot be undone.</p>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showDeleteDialog = false">Cancel</v-btn>
          <v-btn color="error" @click="confirmDelete">Delete</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-navigation-drawer>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../../stores/app';
import FileTree from '../files/FileTree.vue';
import type { FileTreeNode } from '../../types';

const appStore = useAppStore();

const showNewFile = ref(false);
const newFileName = ref('');
const newFileTemplate = ref('blank');
const showDeleteDialog = ref(false);
const deleteTarget = ref<FileTreeNode | null>(null);
const showNewFolder = ref(false);
const newFolderName = ref('');
const newFolderPath = ref('');

const templates = [
  { label: 'Blank page', value: 'blank' },
  { label: 'Research note', value: 'research' },
  { label: 'Literature review', value: 'review' },
  { label: 'Method description', value: 'method' },
  { label: 'Meeting notes', value: 'meeting' },
];

const templateContent: Record<string, string> = {
  blank: `# Untitled

`,
  research: `# Research Note

## Abstract

## Introduction

## Background

## Methodology

## Results

## Discussion

## Conclusion

## References
`,
  review: `# Literature Review

## Overview

## Key Themes

### Theme 1

### Theme 2

## Critical Analysis

## Gaps in Literature

## Summary

## Bibliography
`,
  method: `# Method Description

## Overview

## Prerequisites

## Procedure

### Step 1

### Step 2

### Step 3

## Parameters

| Parameter | Value | Description |
|-----------|-------|-------------|
|           |       |             |

## Expected Outcomes

## Troubleshooting

## References
`,
  meeting: `# Meeting Notes

**Date:** ${new Date().toISOString().split('T')[0]}

## Agenda

## Discussion Points

## Decisions Made

## Action Items

- [ ] Item 1
- [ ] Item 2

## Next Meeting
`,
};

const workspaceName = computed(() => {
  if (!appStore.workspacePath) return '';
  const parts = appStore.workspacePath.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || parts[parts.length - 2] || 'Workspace';
});

function handleFileSelect(path: string) {
  appStore.openFile(path);
}

async function handleMove(source: string, destination: string) {
  try {
    await invoke('move_file', { source, destination });
    appStore.showMessage('File moved');
    if (appStore.workspacePath) {
      await appStore.openFolder(appStore.workspacePath);
    }
  } catch (e: any) {
    appStore.showMessage(e.toString(), 'error');
  }
}

function handleRequestDelete(node: FileTreeNode) {
  deleteTarget.value = node;
  showDeleteDialog.value = true;
}

async function confirmDelete() {
  if (!deleteTarget.value) return;
  try {
    if (deleteTarget.value.is_dir) {
      await invoke('delete_dir', { dirPath: deleteTarget.value.path });
    } else {
      await invoke('delete_file', { filePath: deleteTarget.value.path });
    }
    appStore.showMessage(`Deleted ${deleteTarget.value.name}`);
    // If the deleted file was open, clear it
    if (appStore.currentFile?.path === deleteTarget.value.path) {
      appStore.currentFile = null;
    }
    if (appStore.workspacePath) {
      await appStore.openFolder(appStore.workspacePath);
    }
  } catch (e: any) {
    appStore.showMessage(e.toString(), 'error');
  } finally {
    showDeleteDialog.value = false;
    deleteTarget.value = null;
  }
}

async function createNewFile() {
  if (!newFileName.value.trim()) return;
  const name = newFileName.value.trim().endsWith('.md')
    ? newFileName.value.trim()
    : `${newFileName.value.trim()}.md`;
  await appStore.createFile(name, templateContent[newFileTemplate.value] || templateContent.blank);
  showNewFile.value = false;
  newFileName.value = '';
  newFileTemplate.value = 'blank';
}

function handleRequestCreateFolder(folderPath: string) {
  newFolderPath.value = folderPath;
  newFolderName.value = '';
  showNewFolder.value = true;
}

async function createNewFolder() {
  if (!newFolderName.value.trim()) return;

  const folderName = newFolderName.value.trim();

  try {
    await invoke('create_folder', { folderPath: newFolderPath.value, folderName });
    appStore.showMessage(`Folder "${folderName}" created`);

    if (appStore.workspacePath) {
      await appStore.openFolder(appStore.workspacePath);
    }
  } catch (e: any) {
    appStore.showMessage(e.toString(), 'error');
  } finally {
    showNewFolder.value = false;
    newFolderName.value = '';
    newFolderPath.value = '';
  }
}
</script>
