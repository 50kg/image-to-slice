const { defineConfig } = require("vite");
const path = require("path");

module.exports = defineConfig({
  build: {
    emptyOutDir: false,
    lib: {
      entry: path.resolve(__dirname, "src/plugin/main.js"),
      name: "ImageToSlicePluginMain",
      formats: ["iife"],
      fileName: () => "code.js"
    },
    outDir: "dist",
    rollupOptions: {
      output: {
        extend: true
      }
    }
  }
});
