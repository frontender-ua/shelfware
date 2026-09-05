export default defineNuxtConfig({
  compatibilityDate: '2026-09-01',
  ssr: false,
  modules: ['@nuxt/ui'],
  css: ['~/assets/css/main.css'],
  ui: { fonts: false },
  devtools: { enabled: false },
  nitro: { preset: 'node-server' },
  runtimeConfig: { public: { shelfwareToken: '' } },
  app: { head: { title: 'shelfware' } },
})
