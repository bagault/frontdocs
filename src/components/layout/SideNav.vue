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
  </v-navigation-drawer>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useAppStore } from '../../stores/app';
import FileTree from '../files/FileTree.vue';

const appStore = useAppStore();

const showNewFile = ref(false);
const newFileName = ref('');
const newFileTemplate = ref('blank');

const templates = [
  { label: 'Blank page', value: 'blank' },
  { label: 'Research note', value: 'research' },
  { label: 'Literature review', value: 'review' },
  { label: 'Method description', value: 'method' },
  { label: 'Meeting notes', value: 'meeting' },
];

const templateContent: Record<string, string> = {
  blank: `+++
title = ""
date = "${new Date().toISOString().split('T')[0]}"
description = ""

[taxonomies]
tags = []
+++

`,
  research: `+++
title = ""
date = "${new Date().toISOString().split('T')[0]}"
description = ""

[taxonomies]
tags = ["research"]

[extra]
status = "draft"
+++

## Abstract

## Introduction

## Background

## Methodology

## Results

## Discussion

## Conclusion

## References
`,
  review: `+++
title = "Literature Review: "
date = "${new Date().toISOString().split('T')[0]}"
description = ""

[taxonomies]
tags = ["literature-review"]
+++

## Overview

## Key Themes

### Theme 1

### Theme 2

## Critical Analysis

## Gaps in Literature

## Summary

## Bibliography
`,
  method: `+++
title = ""
date = "${new Date().toISOString().split('T')[0]}"
description = ""

[taxonomies]
tags = ["methodology"]
+++

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
  meeting: `+++
title = "Meeting Notes: "
date = "${new Date().toISOString().split('T')[0]}"
description = ""

[taxonomies]
tags = ["meeting"]

[extra]
attendees = []
+++

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
  const parts = appStore.workspacePath.split('/');
  return parts[parts.length - 1] || parts[parts.length - 2] || 'Workspace';
});

function handleFileSelect(path: string) {
  appStore.openFile(path);
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
</script>
