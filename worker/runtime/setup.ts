import { applyD1Migrations } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import type { Env } from '../src/index';

const e = env as unknown as Env & { TEST_MIGRATIONS: never };
await applyD1Migrations(e.DB, e.TEST_MIGRATIONS);
