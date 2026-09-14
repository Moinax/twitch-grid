// Keep the existing local port and API endpoint while Vite serves the React app.
async function start() {
  const { createServer } = await import('vite');
  const server = await createServer({
    // An explicit port is binding (tests); the default one slides to the next free port so several worktrees can run at once.
    server: { port: Number(process.argv[2] || 8765), strictPort: Boolean(process.argv[2]) },
  });
  await server.listen();
  server.printUrls();
}
start().catch(error => { console.error(error); process.exitCode = 1; });
