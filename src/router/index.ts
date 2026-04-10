import type { RouteRecordRaw } from 'vue-router';
import HomeView from '../views/HomeView.vue';
import WorkspaceView from '../views/WorkspaceView.vue';
import SettingsView from '../views/SettingsView.vue';

export const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: HomeView,
  },
  {
    path: '/workspace',
    name: 'workspace',
    component: WorkspaceView,
  },
  {
    path: '/settings',
    name: 'settings',
    component: SettingsView,
  },
];
