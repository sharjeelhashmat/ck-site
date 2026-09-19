import path from 'node:path';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

const migrations = await readD1Migrations(path.join(import.meta.dirname, 'migrations'));

export default defineConfig({
  test: {
    projects: [
      // Pure logic, Node.
      { test: { name: 'unit', include: ['test/**/*.test.ts'] } },
      // The real Worker running inside workerd (Cloudflare's runtime) with real D1 and KV bindings.
      {
        plugins: [
          cloudflareTest({
            wrangler: { configPath: './wrangler.toml' },
            miniflare: { bindings: { TEST_MIGRATIONS: migrations } },
          }),
        ],
        test: { name: 'workerd', include: ['runtime/**/*.test.ts'], setupFiles: ['./runtime/setup.ts'] },
      },
    ],
  },
});
