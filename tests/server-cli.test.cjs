const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");

const server = path.join(__dirname, "..", "server.cjs");

function run(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [server, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    const timer = setTimeout(() => child.kill(), 3000);
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stderr });
    });
  });
}

test("development server rejects an invalid port with usage guidance", async () => {
  const result = await run(["--lan", "foo"]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Usage: node server\.cjs \[--lan\] \[port\]/);
});

test("development server rejects extra positional arguments", async () => {
  const result = await run(["8765", "extra"]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Usage: node server\.cjs \[--lan\] \[port\]/);
});
