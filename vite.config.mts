import { defineConfig, loadEnv, type Connect } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import search from "./api/search.js";

function installSearch(middlewares: Connect.Server) {
  middlewares.use("/api/search", (req, res) => {
    req.url = "/api/search" + (req.url === "/" ? "" : req.url);
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
    void search(req, res);
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
