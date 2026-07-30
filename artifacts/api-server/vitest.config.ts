import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    // Run all tests in a single forked process so DB fixtures never collide
    singleFork: true,
    env: {
      NODE_ENV: "test",
      // Suppress pino-pretty transport in tests; logger falls back to JSON
      LOG_LEVEL: "silent",
    },
  },
  resolve: {
    // Honour the "workspace" exports condition so @workspace/* packages
    // resolve directly to their TypeScript source files.
    conditions: ["workspace", "import", "default"],
  },
});
