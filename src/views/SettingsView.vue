<template>
  <v-container class="settings-view py-8" style="max-width: 720px">
    <div class="d-flex align-center mb-6">
      <v-btn
        v-if="appStore.hasWorkspace"
        icon="mdi-arrow-left"
        variant="text"
        size="small"
        class="mr-2"
        @click="$router.push('/workspace')"
      />
      <v-btn
        v-else
        icon="mdi-arrow-left"
        variant="text"
        size="small"
        class="mr-2"
        @click="$router.push('/')"
      />
      <h1 class="text-h5 font-weight-bold">Settings</h1>
    </div>

    <!-- AI Provider -->
    <v-card class="mb-4">
      <v-card-title class="text-subtitle-1 font-weight-bold d-flex align-center">
        <v-icon class="mr-2" color="primary">mdi-robot-outline</v-icon>
        AI Provider
      </v-card-title>
      <v-card-text>
        <v-radio-group v-model="settings.ai_provider" inline>
          <v-radio label="Ollama (Local)" value="ollama" color="primary" />
          <v-radio label="External API" value="external" color="primary" />
        </v-radio-group>

        <!-- Ollama settings -->
        <div v-if="settings.ai_provider === 'ollama'">
          <v-text-field
            v-model="settings.ollama_url"
            label="Ollama URL"
            placeholder="http://localhost:11434"
            class="mb-2"
          />

          <div class="d-flex align-center gap-2 mb-2">
            <v-select
              v-model="settings.ollama_model"
              :items="aiStore.ollamaModels.map(m => m.name)"
              label="Model"
              class="flex-grow-1"
              no-data-text="No models found — is Ollama running?"
            />
            <v-btn
              icon="mdi-refresh"
              variant="tonal"
              size="small"
              @click="refreshModels"
              :loading="refreshing"
            />
          </div>

          <v-alert
            v-if="!aiStore.ollamaConnected"
            type="warning"
            variant="tonal"
            density="compact"
            class="mb-2"
          >
            Cannot connect to Ollama. Make sure it's running at {{ settings.ollama_url }}
          </v-alert>
          <v-alert
            v-else
            type="success"
            variant="tonal"
            density="compact"
            class="mb-2"
          >
            Connected — {{ aiStore.ollamaModels.length }} model(s) available
          </v-alert>
        </div>

        <!-- External API settings -->
        <div v-else>
          <v-text-field
            v-model="settings.external_api_url"
            label="API Base URL"
            placeholder="https://api.openai.com/v1"
            class="mb-2"
          />
          <v-text-field
            v-model="settings.external_api_key"
            label="API Key"
            :type="showKey ? 'text' : 'password'"
            :append-inner-icon="showKey ? 'mdi-eye-off' : 'mdi-eye'"
            @click:append-inner="showKey = !showKey"
            class="mb-2"
          />
          <v-text-field
            v-model="settings.external_model"
            label="Model Name"
            placeholder="gpt-4o, claude-3, etc."
          />
        </div>
      </v-card-text>
    </v-card>

    <!-- Processor Settings -->
    <v-card class="mb-4">
      <v-card-title class="text-subtitle-1 font-weight-bold d-flex align-center">
        <v-icon class="mr-2" color="primary">mdi-cog-outline</v-icon>
        Build Processor
      </v-card-title>
      <v-card-text>
        <v-radio-group v-model="settings.processor">
          <v-radio label="MkDocs (Material theme)" value="mkdocs" color="primary" />
          <v-radio label="mdBook (Rust-based)" value="mdbook" color="primary" />
        </v-radio-group>
        <v-alert
          type="info"
          variant="tonal"
          density="compact"
          class="mt-3"
        >
          <strong>{{ settings.processor === 'mkdocs' ? 'MkDocs' : 'mdBook' }}</strong> will be used for all builds in this project.
        </v-alert>
      </v-card-text>
    </v-card>

    <!-- Output Settings -->
    <v-card class="mb-4">
      <v-card-title class="text-subtitle-1 font-weight-bold d-flex align-center">
        <v-icon class="mr-2" color="primary">mdi-export</v-icon>
        Output
      </v-card-title>
      <v-card-text>
        <v-radio-group v-model="settings.output_format" inline>
          <v-radio label="Folder" value="folder" color="primary" />
          <v-radio label="ZIP Archive" value="archive" color="primary" />
        </v-radio-group>

        <v-text-field
          v-model="outputPathDisplay"
          label="Output Location"
          :placeholder="'Default: next to input folder'"
          readonly
          @click="selectOutputPath"
          append-inner-icon="mdi-folder-outline"
          @click:append-inner="selectOutputPath"
        />
        <v-btn
          v-if="settings.output_path"
          variant="text"
          size="small"
          color="error"
          @click="settings.output_path = null"
        >
          Reset to default location
        </v-btn>

        <v-text-field
          v-model="settings.base_url"
          label="Base URL (for links in static site)"
          placeholder="https://frontdocs.local"
          class="mt-3"
        />
      </v-card-text>
    </v-card>

    <!-- Save -->
    <div class="d-flex justify-end gap-2">
      <v-btn variant="text" @click="resetSettings">Reset to Defaults</v-btn>
      <v-btn color="primary" @click="handleSave" :loading="saving" prepend-icon="mdi-content-save">
        Save Settings
      </v-btn>
    </div>
  </v-container>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { open } from '@tauri-apps/plugin-dialog';
import { useAppStore } from '../stores/app';
import { useSettingsStore } from '../stores/settings';
import { useAiStore } from '../stores/ai';

const appStore = useAppStore();
const settingsStore = useSettingsStore();
const aiStore = useAiStore();

const settings = reactive({ ...settingsStore.current });
const showKey = ref(false);
const saving = ref(false);
const refreshing = ref(false);

const outputPathDisplay = computed(
  () => settings.output_path || 'Default (project: dist/, otherwise next to input folder)'
);

onMounted(async () => {
  Object.assign(settings, settingsStore.current);
  await aiStore.checkOllama();
});

async function refreshModels() {
  refreshing.value = true;
  settingsStore.update({ ollama_url: settings.ollama_url });
  await aiStore.checkOllama();
  refreshing.value = false;
}

async function selectOutputPath() {
  const selected = await open({
    directory: true,
    multiple: false,
    title: 'Select Output Folder',
  });
  if (selected && typeof selected === 'string') {
    settings.output_path = selected;
  }
}

async function handleSave() {
  saving.value = true;
  try {
    settingsStore.update({ ...settings });
    await settingsStore.save();
    appStore.showMessage('Settings saved');
  } catch (e: any) {
    appStore.showMessage(e.toString(), 'error');
  } finally {
    saving.value = false;
  }
}

function resetSettings() {
  Object.assign(settings, {
    output_format: 'folder',
    output_path: null,
    ai_provider: 'ollama',
    ollama_url: 'http://localhost:11434',
    ollama_model: '',
    external_api_url: '',
    external_api_key: '',
    external_model: '',
    theme: 'dark',
    base_url: 'https://frontdocs.local',
  });
}
</script>

<style scoped>
.settings-view {
  overflow-y: auto;
  height: 100%;
}
</style>
