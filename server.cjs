// Keep the existing local port and API endpoint while Vite serves the React app.
const usage = "Usage: node server.cjs [--lan] [port]";

function parseArgs(args) {
  let lan = false;
  let portArg;
  for (const arg of args) {
    if (arg === "--lan") {
      if (lan) throw new Error(usage);
      lan = true;
    } else {
      if (portArg !== undefined || arg.startsWith("-")) throw new Error(usage);
      portArg = arg;
    }
  }
  if (portArg !== undefined && !/^\d+$/.test(portArg)) throw new Error(usage);
  const port = Number(portArg || 8765);
  if (port < 1 || port > 65535) throw new Error(usage);
  return { lan, port, strictPort: portArg !== undefined };
}

async function start() {
  const { lan, port, strictPort } = parseArgs(process.argv.slice(2));
  const { createServer } = await import("vite");
  const server = await createServer({
    // An explicit port is binding (tests); the default one slides to the next free port so several worktrees can run at once.
    server: { host: lan ? "0.0.0.0" : "localhost", port, strictPort },
  });
  await server.listen();
  if (lan)
    console.info(
      "LAN mode: the app and local API are accessible from other devices on your network.",
    );
  server.printUrls();
}
start().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
