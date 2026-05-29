import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import path from "node:path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode ?? "test", process.cwd(), "");
  return {
    test: {
      environment: "node",
      include: ["tests/**/*.test.ts"],
      exclude: ["tests/e2e/**"],
      env,
    },
    resolve: {
      alias: { "@": path.resolve(__dirname, "src") },
    },
  };
});
