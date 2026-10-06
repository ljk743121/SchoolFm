import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "~~": root,
      "@": `${root}app`,
      "~": `${root}app`,
    },
  },
  test: {
    // 在沙箱环境下 forks 池可能因 spawn 受限而失败，threads 更稳
    pool: "threads",
    include: ["server/utils/tests/**/*.test.ts"],
  },
});
