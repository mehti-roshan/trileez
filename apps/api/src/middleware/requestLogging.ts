import type { RequestHandler } from 'express';
import { logger } from '../observability/logger.js';

export const requestLoggingMiddleware: RequestHandler = (req, res, next) => {
  const started = process.hrtime.bigint();
  let logged = false;
  const log = () => {
    if (logged) return;
    logged = true;
    const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
    const fields = {
      event: 'http_request', method: req.method, path: req.path, statusCode: res.statusCode,
      durationMs: Number(durationMs.toFixed(3)), responseBytes: Number(res.getHeader('content-length') || 0) || undefined,
      ip: req.ip, userAgent: req.get('user-agent'),
    };
    if (res.statusCode >= 500) logger.error('http_request_completed', fields);
    else if (res.statusCode >= 400) logger.warn('http_request_completed', fields);
    else logger.info('http_request_completed', fields);
  };
  res.once('finish', log); res.once('close', log); next();
};
