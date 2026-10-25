import type { UserRecord } from './entities.js';

declare global {
  namespace Express {
    interface Request {
      user?: UserRecord;
      authSession?: import('./entities.js').AppRecord;
      validatedQuery?: Record<string, unknown>;
      requestId?: string;
      correlationId?: string;
    }
  }
}

export {};
