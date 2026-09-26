// Keep the existing local port and API endpoint while Vite serves the React app.
async function start() {
  const args = process.argv.slice(2);
  const lan = args.includes('--lan');
  const port = args.find(arg => arg !== '--lan');
  const { createServer } = await import('vite');
  const server = await createServer({
    // An explicit port is binding (tests); the default one slides to the next free port so several worktrees can run at once.
    server: { host: lan ? '0.0.0.0' : 'localhost', port: Number(port || 8765), strictPort: Boolean(port) },
  });
  await server.listen();
  if (lan) console.info('LAN mode: the app and local API are accessible from other devices on your network.');
  server.printUrls();
}
start().catch(error => { console.error(error); process.exitCode = 1; });
