import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createWebHistory } from 'vue-router';
import { createVuetify } from 'vuetify';
import * as components from 'vuetify/components';
import * as directives from 'vuetify/directives';
import '@mdi/font/css/materialdesignicons.css';
import 'vuetify/styles';
import './styles/main.scss';
import App from './App.vue';
import { routes } from './router';

const router = createRouter({
  history: createWebHistory(),
  routes,
});

const vuetify = createVuetify({
  components,
  directives,
  theme: {
    defaultTheme: 'frontdocsDark',
    themes: {
      frontdocsDark: {
        dark: true,
        colors: {
          background: '#0D1117',
          surface: '#161B22',
          'surface-variant': '#1C2333',
          'surface-bright': '#21273A',
          primary: '#5C7CFA',
          'primary-darken-1': '#3D5AFE',
          secondary: '#7C8FFF',
          'secondary-darken-1': '#3D5AFE',
          accent: '#738FFF',
          error: '#CF6679',
          info: '#64B5F6',
          success: '#66BB6A',
          warning: '#FFA726',
          'on-background': '#E6EDF3',
          'on-surface': '#E6EDF3',
          'on-primary': '#FFFFFF',
          'on-secondary': '#FFFFFF',
        },
      },
    },
  },
  defaults: {
    VBtn: {
      variant: 'flat',
      rounded: 'lg',
    },
    VCard: {
      rounded: 'lg',
      elevation: 0,
    },
    VTextField: {
      variant: 'outlined',
      density: 'comfortable',
    },
    VSelect: {
      variant: 'outlined',
      density: 'comfortable',
    },
    VTextarea: {
      variant: 'outlined',
      density: 'comfortable',
    },
  },
});

const pinia = createPinia();
const app = createApp(App);

app.use(pinia);
app.use(router);
app.use(vuetify);

app.mount('#app');
