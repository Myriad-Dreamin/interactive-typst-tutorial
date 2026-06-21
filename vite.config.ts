import { defineConfig, normalizePath, type Plugin } from "vite";

declare const process: {
  env: {
    BASE_PATH?: string;
  };
};

function normalizeBasePath(basePath: string | undefined): string {
  if (!basePath) {
    return "/";
  }

  const withLeadingSlash = basePath.startsWith("/") ? basePath : `/${basePath}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`;
}

function interactiveGuideContentWatcher(): Plugin {
  return {
    name: "interactive-guide-content-watch",
    apply: "serve",
    configureServer(server) {
      const interactiveGuideRoot = normalizePath(
        `${server.config.root}/content/interactive-guide`
      );
      let reloadTimer: ReturnType<typeof setTimeout> | null = null;

      const reloadGuide = (file: string) => {
        const normalizedFile = normalizePath(file);

        if (
          !normalizedFile.startsWith(`${interactiveGuideRoot}/`) ||
          !normalizedFile.endsWith(".typ")
        ) {
          return;
        }

        if (reloadTimer) {
          clearTimeout(reloadTimer);
        }

        reloadTimer = setTimeout(() => {
          reloadTimer = null;
          server.moduleGraph.invalidateAll();
          server.ws.send({
            type: "full-reload",
            path: "*"
          });
        }, 50);
      };

      server.watcher.add(interactiveGuideRoot);
      server.watcher.on("add", reloadGuide);
      server.watcher.on("change", reloadGuide);
      server.watcher.on("unlink", reloadGuide);

      return () => {
        if (reloadTimer) {
          clearTimeout(reloadTimer);
        }
      };
    }
  };
}

export default defineConfig({
  base: normalizeBasePath(process.env.BASE_PATH),
  plugins: [interactiveGuideContentWatcher()],
  build: {
    chunkSizeWarningLimit: 3000,
    rollupOptions: {
      output: {
        chunkFileNames: "assets/[name]-[hash].js",
        entryFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
        manualChunks(id) {
          const normalized = id.replaceAll("\\", "/");

          if (normalized.includes("/node_modules/monaco-editor/")) {
            return "vendor/monaco-editor";
          }

          const match = normalized.match(
            /\/content\/interactive-guide\/(chapter[^/]+)\/[^/?]+\.typ(?:\?raw)?$/
          );

          if (match) {
            return `chapters/${match[1]}`;
          }

          return undefined;
        }
      }
    }
  }
});
