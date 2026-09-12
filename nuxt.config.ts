import tailwindcss from '@tailwindcss/vite'

/**
 * Web 门户（Nuxt 3）：SSR 壳 + BFF。
 * - BFF 持有 refresh token（httpOnly Cookie），Access Token 仅存客户端内存
 * - 设计 token 来自 @club-oa/ui（与 Tauri 客户端共用）
 */
export default defineNuxtConfig({
  compatibilityDate: '2026-09-13',
  devtools: { enabled: false },
  modules: ['@pinia/nuxt'],
  css: ['~/assets/css/main.css'],
  vite: {
    plugins: [tailwindcss()],
  },
  runtimeConfig: {
    // 服务端专用：auth 服务内网地址（不进浏览器）
    authServiceUrl: process.env.AUTH_SERVICE_URL || 'http://localhost:8081',
    public: {
      appName: '社团 OA',
    },
  },
  typescript: { strict: true },
})
