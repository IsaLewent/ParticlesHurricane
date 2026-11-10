import glsl from "vite-plugin-glsl";

import { defineConfig } from "vite";

export default defineConfig({
  // index.html'in src klasörü içinde olduğunu belirtiyoruz
  root: "src/",

  // Statik dosyaların (görsel, font vb.) en dıştaki 'static' klasöründe olduğunu belirtiyoruz
  publicDir: "../public/",

  plugins: [
    glsl()
  ],

  server: {
    // Hem yerel ağdaki (Network) diğer cihazların erişmesini açıyoruz
    // hem de varsayılan portu 3000 yapıyoruz (istersen değiştirebilirsin)
    host: true,
    port: 5173,
  },
  build: {
    target: "esnext",
  }
});
