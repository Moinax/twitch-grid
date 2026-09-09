// Keep the existing local port and API endpoint while Vite serves the React app.
async function start() {
  const { createServer } = await import('vite');
  const server = await createServer({
    server: { port: Number(process.argv[2] || 8765), strictPort: true },
  });
  await server.listen();
  server.printUrls();
}
start().catch(error => { console.error(error); process.exitCode = 1; });
