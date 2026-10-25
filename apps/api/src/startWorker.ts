import { runEntrypoint } from './observability/bootstrap.js';

await runEntrypoint('worker', () => import('./worker.js'));
