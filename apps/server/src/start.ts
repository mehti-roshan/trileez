import { runEntrypoint } from './observability/bootstrap.js';

await runEntrypoint('api', () => import('./server.js'));
