// ck-reelly-tool: the private Reelly research tool (see app.ts). The entry point binds the real fetch and the assets.
import { createApp, type Env } from './app';
import { ASSETS } from './assets';

const app = createApp({ fetch: (input, init) => fetch(input, init), assets: ASSETS });
export default { fetch: (req: Request, env: Env) => app.fetch(req, env) } satisfies ExportedHandler<Env>;
