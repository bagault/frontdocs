<template>
  <v-dialog v-model="modelValue" max-width="520" persistent>
    <v-card>
      <v-card-title class="text-h6 d-flex align-center">
        <v-icon class="mr-2" color="primary">mdi-export</v-icon>
        Export Knowledge Base
      </v-card-title>

      <v-card-text>
        <v-alert
          v-if="!appStore.buildOutput?.success"
          type="info"
          variant="tonal"
          class="mb-4"
        >
          The site needs to be built before exporting. Click "Build & Export" to do both.
        </v-alert>

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
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="close">Cancel</v-btn>
        <v-btn
          color="primary"
          @click="handleExport"
          :loading="exporting"
          prepend-icon="mdi-export"
        >
          {{ appStore.buildOutput?.success ? 'Export' : 'Build & Export' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { open } from '@tauri-apps/plugin-dialog';
import { useAppStore } from '../../stores/app';
import { useSettingsStore } from '../../stores/settings';

const modelValue = defineModel<boolean>();

const appStore = useAppStore();
const settingsStore = useSettingsStore();

const format = ref(settingsStore.current.output_format || 'folder');
const outputPath = ref<string | null>(settingsStore.current.output_path);
const exporting = ref(false);

const outputDisplay = computed(
  () => outputPath.value || 'Default (next to input folder)'
);

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

async function handleExport() {
  exporting.value = true;
  try {
    await appStore.buildAndExport(format.value, outputPath.value || undefined);
    close();
  } catch {
    // Error shown via snackbar
  } finally {
    exporting.value = false;
  }
}

function close() {
  modelValue.value = false;
}
</script>
