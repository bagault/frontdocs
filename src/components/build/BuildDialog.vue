<template>
  <v-dialog v-model="appStore.isBuildDialogOpen" max-width="560" persistent>
    <v-card>
      <v-card-title class="text-h6 d-flex align-center">
        <v-icon class="mr-2" color="primary">mdi-hammer-wrench</v-icon>
        Build &amp; Export
      </v-card-title>

      <v-card-text>
        <!-- Format selection (only before building) -->
        <div v-if="!isBuilding && appStore.buildProgress === 0">
          <v-radio-group v-model="format" inline class="mb-3">
            <v-radio label="Folder" value="folder" color="primary">
              <template #label>
                <div class="d-flex align-center">
                  <v-icon class="mr-1" size="18">mdi-folder-outline</v-icon>
                  Folder
                </div>
              </template>
            </v-radio>
            <v-radio label="ZIP Archive" value="archive" color="primary">
              <template #label>
                <div class="d-flex align-center">
                  <v-icon class="mr-1" size="18">mdi-zip-box-outline</v-icon>
                  ZIP Archive
                </div>
              </template>
            </v-radio>
          </v-radio-group>

          <v-text-field
            :model-value="outputDisplay"
            label="Output location"
            readonly
            @click="selectOutput"
            append-inner-icon="mdi-folder-outline"
            @click:append-inner="selectOutput"
            hint="Click to choose a different folder"
            persistent-hint
          />
        </div>

        <!-- Progress section -->
        <div v-if="isBuilding || appStore.buildProgress > 0" class="mt-2">
          <div class="d-flex align-center mb-2">
            <span class="text-body-2 font-weight-medium">
              {{ appStore.buildProgress < 100 ? 'Building...' : (lastBuildSuccess ? 'Complete' : 'Failed') }}
            </span>
            <v-spacer />
            <span class="text-body-2 font-weight-bold" :class="progressColor + '--text'">
              {{ Math.round(appStore.buildProgress) }}%
            </span>
          </div>
          <v-progress-linear
            :model-value="appStore.buildProgress"
            :color="progressColor"
            height="8"
            rounded
          />

          <!-- Build log -->
          <div class="build-log mt-3" ref="logContainer">
            <div
              v-for="(line, idx) in appStore.buildLog"
              :key="idx"
              class="text-caption"
              :class="line.startsWith('Error') || line.startsWith('Build failed') || line.startsWith('Export failed') ? 'text-error' : 'text-medium-emphasis'"
            >
              {{ line }}
            </div>
          </div>
        </div>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="close" :disabled="isBuilding">
          {{ appStore.buildProgress >= 100 ? 'Close' : 'Cancel' }}
        </v-btn>
        <v-btn
          v-if="appStore.buildProgress === 0"
          color="success"
          @click="handleBuild"
          :loading="isBuilding"
          prepend-icon="mdi-hammer-wrench"
        >
          Build &amp; Export
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import { open } from '@tauri-apps/plugin-dialog';
import { useAppStore } from '../../stores/app';
import { useSettingsStore } from '../../stores/settings';

const appStore = useAppStore();
const settingsStore = useSettingsStore();

const format = ref(settingsStore.current.output_format || 'folder');
const outputPath = ref<string | null>(settingsStore.current.output_path);
const isBuilding = ref(false);
const logContainer = ref<HTMLElement>();

const lastBuildSuccess = computed(() => {
  const lastLine = appStore.buildLog[appStore.buildLog.length - 1] || '';
  return !lastLine.startsWith('Error') && !lastLine.startsWith('Build failed') && !lastLine.startsWith('Export failed');
});

const progressColor = computed(() => {
  if (appStore.buildProgress >= 100) {
    return lastBuildSuccess.value ? 'success' : 'error';
  }
  return 'success';
});

const outputDisplay = computed(
  () => outputPath.value || 'Default (next to input folder)'
);

watch(() => appStore.buildLog.length, () => {
  nextTick(() => {
    if (logContainer.value) {
      logContainer.value.scrollTop = logContainer.value.scrollHeight;
    }
  });
});

async function selectOutput() {
  const selected = await open({
    directory: true,
    multiple: false,
    title: 'Select Export Location',
  });
  if (selected && typeof selected === 'string') {
    outputPath.value = selected;
  }
}

async function handleBuild() {
  isBuilding.value = true;
  try {
    await appStore.buildAndExport(format.value, outputPath.value || undefined);
  } finally {
    isBuilding.value = false;
  }
}

function close() {
  appStore.isBuildDialogOpen = false;
  // Reset progress for next build
  if (appStore.buildProgress >= 100) {
    appStore.buildProgress = 0;
    appStore.buildLog = [];
  }
}
</script>

<style scoped>
.build-log {
  max-height: 180px;
  overflow-y: auto;
  background: var(--fd-background);
  border: 1px solid var(--fd-border);
  border-radius: 6px;
  padding: 8px 12px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  line-height: 1.6;
}
</style>
