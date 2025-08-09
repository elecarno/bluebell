import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    plugins: [svelte()]
  },
  webPreferences: {
    nodeIntegration: true, // Optional: only if needed
    contextIsolation: false, // Only disable if you're not using preload
  },
  optimizeDeps: {
    include: ['svelte-awesome-color-picker']
  }
})
