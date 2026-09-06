export default defineNuxtConfig({
  compatibilityDate: '2026-09-01',
  ssr: false,
  modules: ['@nuxt/ui'],
  css: ['~/assets/css/main.css'],
  ui: { fonts: false },
  // ssr:false would make @nuxt/icon default to the Iconify CDN; spec §10 keeps the app loopback-only.
  icon: { provider: 'none', clientBundle: { scan: true, includeCustomCollections: true, sizeLimitKb: 512 } },
  devtools: { enabled: false },
  nitro: { preset: 'node-server' },
  runtimeConfig: { public: { shelfwareToken: '' } },
  app: { head: { title: 'shelfware' } },
})
