// Build settings: React, plus the app manifest and service worker that let a phone install the app
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["apple-touch-icon.png"],
      manifest: {
        id: "/vinyl-records",
        name: "Vinyl Collection",
        short_name: "Vinyl",
        description: "Your records and everything you have spun.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#15120e",
        theme_color: "#15120e",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Only the app itself is kept for opening without a signal. Records and plays always come fresh from
        // Supabase; keeping them for offline use comes in a later step.
        globPatterns: ["**/*.{js,css,html,png,svg,woff2}"],
        navigateFallback: "/index.html",
      },
    }),
  ],
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.{ts,tsx}"],
  },
});
