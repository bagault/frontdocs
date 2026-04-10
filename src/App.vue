<template>
  <v-app>
    <AppBar v-if="appStore.hasWorkspace" />

    <SideNav v-if="appStore.hasWorkspace" />

    <v-main>
      <router-view />
    </v-main>

    <v-snackbar
      v-model="appStore.snackbar.show"
      :color="appStore.snackbar.color"
      :timeout="3000"
      location="bottom right"
    >
      {{ appStore.snackbar.text }}
      <template #actions>
        <v-btn variant="text" @click="appStore.snackbar.show = false">
          Close
        </v-btn>
      </template>
    </v-snackbar>
  </v-app>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useAppStore } from './stores/app';
import { useSettingsStore } from './stores/settings';
import { useAiStore } from './stores/ai';
import AppBar from './components/layout/AppBar.vue';
import SideNav from './components/layout/SideNav.vue';

const appStore = useAppStore();
const settingsStore = useSettingsStore();
const aiStore = useAiStore();

onMounted(async () => {
  await settingsStore.load();
  await aiStore.checkOllama();
});
</script>
