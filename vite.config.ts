// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import type { Plugin } from "vite";

const MIME: Record<string, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
  txt: "text/plain; charset=utf-8",
  jpg: "image/jpeg",
};

/** Vendor attachments must arrive with real Office/PDF content types, or browsers render them as junk text. */
function vendorAttachmentMime(): Plugin {
  return {
    name: "vendor-attachment-mime",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split("?")[0] ?? "";
        if (url.startsWith("/vendor-quotes/")) {
          const ext = url.split(".").pop()?.toLowerCase() ?? "";
          const mime = MIME[ext];
          if (mime) {
            res.setHeader("Content-Type", mime);
            res.setHeader("X-Content-Type-Options", "nosniff");
            if (ext !== "jpg") {
              res.setHeader(
                "Content-Disposition",
                `attachment; filename="${url.split("/").pop()}"`,
              );
            }
          }
        }
        next();
      });
    },
  };
}

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [vendorAttachmentMime()],
  },
});
