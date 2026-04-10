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
            Open Markdown Folder
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
  </v-container>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { open } from '@tauri-apps/plugin-dialog';
import { useAppStore } from '../stores/app';
import { useAiStore } from '../stores/ai';

const router = useRouter();
const appStore = useAppStore();
const aiStore = useAiStore();
const isOpening = ref(false);

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
      title: 'Select Markdown Folder',
    });
    if (selected && typeof selected === 'string') {
      await appStore.openFolder(selected);
      router.push('/workspace');
    }
  } catch (e: any) {
    appStore.showMessage(e.toString(), 'error');
  } finally {
    isOpening.value = false;
  }
}

async function handleNewProject() {
  const selected = await open({
    directory: true,
    multiple: false,
    title: 'Select Folder for New Project',
  });
  if (selected && typeof selected === 'string') {
    await appStore.openFolder(selected);
    router.push('/workspace');
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
