import { defineConfig, loadEnv, type Connect } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import search from "./api/search.js";
import stream from "./api/stream.js";

function installSearch(middlewares: Connect.Server) {
  for (const [path, handler] of [
    ["/api/search", search],
    ["/api/stream", stream],
  ] as const)
    middlewares.use(path, (req, res) => {
      req.url = path + (req.url === "/" ? "" : req.url);
      Object.assign(res, {
        status(code: number) {
          res.statusCode = code;
          return res;
        },
        json(data: unknown) {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(data));
        },
      });
      void handler(req, res);
    });
}

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), "TWITCH_SEARCH_"));
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: "twitch-search",
        configureServer(server) {
          installSearch(server.middlewares);
        },
        configurePreviewServer(server) {
          installSearch(server.middlewares);
        },
      },
    ],
    server: { host: "localhost", port: 8765 },
  };
});
