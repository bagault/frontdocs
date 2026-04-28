<template>
  <v-app-bar density="compact" color="surface" elevation="0" class="app-bar">
    <v-app-bar-nav-icon @click="appStore.sideNavOpen = !appStore.sideNavOpen" />

    <img src="/assets/logo.svg" alt="Frontdocs" class="fd-logo ml-1" style="width:32px;height:32px" />
    <v-app-bar-title class="ml-3 text-body-1 font-weight-bold">
      Frontdocs
    </v-app-bar-title>

    <template #append>
      <v-btn icon size="small" variant="text" @click="appStore.undo()" :disabled="!appStore.canUndo">
        <v-icon>mdi-undo</v-icon>
        <v-tooltip activator="parent" location="bottom">Undo (Ctrl+Z)</v-tooltip>
      </v-btn>

      <v-btn
        icon="mdi-robot-outline"
        :color="appStore.aiPanelOpen ? 'primary' : undefined"
        size="small"
        variant="text"
        @click="appStore.aiPanelOpen = !appStore.aiPanelOpen"
      >
        <v-icon>mdi-robot-outline</v-icon>
        <v-tooltip activator="parent" location="bottom">AI Assistant</v-tooltip>
      </v-btn>

      <div class="build-btn-wrapper">
        <v-btn icon size="small" variant="text" @click="handleBuild" :loading="appStore.isLoading">
          <v-icon>mdi-hammer-wrench</v-icon>
          <v-tooltip activator="parent" location="bottom">Build &amp; Export</v-tooltip>
        </v-btn>
        <v-progress-linear
          v-if="appStore.buildProgress > 0 && appStore.buildProgress < 100"
          :model-value="appStore.buildProgress"
          color="success"
          height="3"
          class="build-progress"
        />
      </div>

      <v-btn icon size="small" variant="text" @click="$router.push('/settings')">
        <v-icon>mdi-cog-outline</v-icon>
        <v-tooltip activator="parent" location="bottom">Settings</v-tooltip>
      </v-btn>

      <v-btn icon size="small" variant="text" @click="handleClose">
        <v-icon>mdi-folder-remove-outline</v-icon>
        <v-tooltip activator="parent" location="bottom">Close Workspace</v-tooltip>
      </v-btn>
    </template>
  </v-app-bar>

  <BuildDialog />
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useAppStore } from '../../stores/app';
import BuildDialog from '../build/BuildDialog.vue';

const appStore = useAppStore();
const router = useRouter();

function handleBuild() {
  appStore.isBuildDialogOpen = true;
}

function handleClose() {
  appStore.closeWorkspace();
  router.push('/');
}
</script>

<style scoped>
.app-bar {
  border-bottom: 1px solid var(--fd-border) !important;
}
.build-btn-wrapper {
  position: relative;
  display: inline-flex;
  align-items: center;
}
.build-progress {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  border-radius: 2px;
}
</style>
