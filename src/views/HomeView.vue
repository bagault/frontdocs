<template>
  <v-container fluid class="fill-height home-view pa-0">
    <v-row class="fill-height" no-gutters align="center" justify="center">
      <v-col cols="12" sm="8" md="6" lg="5" xl="4">
        <div class="text-center">
          <!-- Logo -->
          <div class="mb-6">
            <img src="/assets/logo.svg" alt="Frontdocs" class="fd-logo fd-glow" style="width:96px;height:96px" />
          </div>

          <h1 class="text-h3 font-weight-bold mb-2">Frontdocs</h1>
          <p class="text-body-1 text-medium-emphasis mb-8">
            Academic Knowledge Base Builder
          </p>

          <!-- Main action -->
          <v-btn
            color="primary"
            size="x-large"
            prepend-icon="mdi-folder-open-outline"
            class="mb-4 fd-glow"
            @click="handleOpenFolder"
            :loading="isOpening"
            block
          >
            Open Folder
          </v-btn>

          <!-- Divider -->
          <div class="d-flex align-center my-6">
            <v-divider />
            <span class="mx-4 text-caption text-medium-emphasis">OR</span>
            <v-divider />
          </div>

          <!-- Quick actions -->
          <v-row dense>
            <v-col cols="6">
              <v-card
                class="pa-4 text-center action-card"
                variant="outlined"
                @click="handleNewProject"
                hover
              >
                <v-icon size="32" color="primary" class="mb-2">mdi-plus-circle-outline</v-icon>
                <div class="text-body-2 font-weight-medium">New Project</div>
                <div class="text-caption text-medium-emphasis">Start from scratch</div>
              </v-card>
            </v-col>
            <v-col cols="6">
              <v-card
                class="pa-4 text-center action-card"
                variant="outlined"
                @click="$router.push('/settings')"
                hover
              >
                <v-icon size="32" color="secondary" class="mb-2">mdi-cog-outline</v-icon>
                <div class="text-body-2 font-weight-medium">Settings</div>
                <div class="text-caption text-medium-emphasis">Configure AI & output</div>
              </v-card>
            </v-col>
          </v-row>

          <!-- AI Status -->
          <v-card class="mt-6 pa-3" variant="outlined">
            <div class="d-flex align-center">
              <v-icon
                :color="aiStore.ollamaConnected ? 'success' : 'error'"
                size="18"
                class="mr-2"
              >
                {{ aiStore.ollamaConnected ? 'mdi-check-circle' : 'mdi-alert-circle' }}
              </v-icon>
              <span class="text-body-2">
                Ollama:
                <span :class="aiStore.ollamaConnected ? 'text-success' : 'text-error'">
                  {{ aiStore.ollamaConnected ? 'Connected' : 'Not available' }}
                </span>
              </span>
              <v-spacer />
              <v-btn
                variant="text"
                size="x-small"
                icon="mdi-refresh"
                @click="aiStore.checkOllama()"
              />
            </div>
          </v-card>

          <!-- Features overview -->
          <div class="mt-8">
            <v-row dense>
              <v-col v-for="feature in features" :key="feature.title" cols="4">
                <div class="text-center pa-2">
                  <v-icon size="24" :color="feature.color" class="mb-1">{{ feature.icon }}</v-icon>
                  <div class="text-caption font-weight-medium">{{ feature.title }}</div>
                </div>
              </v-col>
            </v-row>
          </div>
        </div>
      </v-col>
    </v-row>

    <!-- Convert to project dialog -->
    <v-dialog v-model="showConvertDialog" max-width="500" persistent>
      <v-card>
        <v-card-title class="text-h6">Convert to {{ settingsStore.current.processor === 'mdbook' ? 'mdBook' : 'MkDocs' }} Project?</v-card-title>
        <v-card-text>
          <p class="mb-3">
            This folder contains Markdown files but is not yet a {{ settingsStore.current.processor === 'mdbook' ? 'mdBook' : 'MkDocs' }} project.
          </p>
          <p class="mb-3">
            Converting will create a project structure with:
          </p>
          <ul class="ml-4 mb-3" v-if="settingsStore.current.processor === 'mdbook'">
            <li><strong>book.toml</strong> — mdBook configuration</li>
            <li><strong>src/</strong> — your Markdown files (moved here)</li>
            <li><strong>SUMMARY.md</strong> — book structure</li>
          </ul>
          <ul class="ml-4 mb-3" v-else>
            <li><strong>mkdocs.yml</strong> — MkDocs configuration</li>
            <li><strong>src/</strong> — your Markdown files (moved here)</li>
            <li><strong>extensions/</strong> — third-party MkDocs extensions</li>
          </ul>
          <v-text-field
            v-model="projectTitle"
            label="Project title"
            placeholder="My Knowledge Base"
            class="mt-4"
          />
          <v-alert type="info" variant="tonal" density="compact" class="mt-2">
            You can also skip this and work with raw Markdown files directly.
          </v-alert>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="skipConversion">Skip</v-btn>
          <v-btn color="primary" @click="doConvert" :loading="isConverting">
            Convert
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { useAppStore } from '../stores/app';
import { useAiStore } from '../stores/ai';
import { useSettingsStore } from '../stores/settings';

const router = useRouter();
const appStore = useAppStore();
const aiStore = useAiStore();
const settingsStore = useSettingsStore();
const isOpening = ref(false);
const showConvertDialog = ref(false);
const isConverting = ref(false);
const projectTitle = ref('');
const pendingFolderPath = ref('');

const features = [
  { icon: 'mdi-robot-outline', title: 'AI Powered', color: 'primary' },
  { icon: 'mdi-xml', title: 'Static HTML', color: 'info' },
  { icon: 'mdi-math-integral', title: 'LaTeX / KaTeX', color: 'accent' },
  { icon: 'mdi-format-quote-close', title: 'Citations', color: 'secondary' },
  { icon: 'mdi-file-tree', title: 'Navigation', color: 'success' },
  { icon: 'mdi-magnify', title: 'Search', color: 'warning' },
];

async function handleOpenFolder() {
  isOpening.value = true;
  try {
    const selected = await open({
      directory: true,
      multiple: false,
      title: 'Select Folder',
    });
    if (selected && typeof selected === 'string') {
      // Detect project type
      const projectType = await invoke<string>('detect_project_type', { folderPath: selected });

      if (projectType === 'project') {
        // Already an MkDocs project — open directly
        await appStore.openFolder(selected);
        router.push('/workspace');
      } else if (projectType === 'markdown') {
        // Raw markdown folder — offer conversion
        pendingFolderPath.value = selected;
        const parts = selected.replace(/\\/g, '/').split('/');
        projectTitle.value = parts[parts.length - 1] || parts[parts.length - 2] || 'My Knowledge Base';
        showConvertDialog.value = true;
      } else {
        // Empty folder — open as-is
        await appStore.openFolder(selected);
        router.push('/workspace');
      }
    }
  } catch (e: any) {
    appStore.showMessage(e.toString(), 'error');
  } finally {
    isOpening.value = false;
  }
}

async function skipConversion() {
  showConvertDialog.value = false;
  await appStore.openFolder(pendingFolderPath.value);
  router.push('/workspace');
}

async function doConvert() {
  isConverting.value = true;
  try {
    const processor = settingsStore.current.processor || 'mkdocs';
    const commandName = processor === 'mdbook' ? 'convert_to_project_mdbook' : 'convert_to_project';
    await invoke(commandName, {
      folderPath: pendingFolderPath.value,
      title: projectTitle.value || 'My Knowledge Base',
    });
    appStore.showMessage(`Converted to ${processor === 'mdbook' ? 'mdBook' : 'MkDocs'} project`);
    showConvertDialog.value = false;
    await appStore.openFolder(pendingFolderPath.value);
    router.push('/workspace');
  } catch (e: any) {
    appStore.showMessage(e.toString(), 'error');
  } finally {
    isConverting.value = false;
  }
}

async function handleNewProject() {
  const selected = await open({
    directory: true,
    multiple: false,
    title: 'Select Folder for New Project',
  });
  if (selected && typeof selected === 'string') {
    // Create a new project structure with the selected processor
    try {
      const parts = selected.replace(/\\/g, '/').split('/');
      const title = parts[parts.length - 1] || 'New Project';
      const processor = settingsStore.current.processor || 'mkdocs';
      const commandName = processor === 'mdbook' ? 'convert_to_project_mdbook' : 'convert_to_project';
      await invoke(commandName, { folderPath: selected, title });
      await appStore.openFolder(selected);
      router.push('/workspace');
    } catch (e: any) {
      appStore.showMessage(e.toString(), 'error');
    }
  }
}
</script>

<style scoped>
.home-view {
  background: radial-gradient(ellipse at 50% 30%, rgba(0, 0, 140, 0.12) 0%, transparent 60%);
}
.action-card {
  cursor: pointer;
  transition: border-color 0.2s ease, transform 0.15s ease;
}
.action-card:hover {
  border-color: var(--fd-primary-light) !important;
  transform: translateY(-2px);
}
</style>
