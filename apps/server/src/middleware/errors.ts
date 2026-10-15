import type { ErrorRequestHandler, RequestHandler } from 'express';
import multer from 'multer';
import { RequestValidationError } from './validate.js';
import { logger } from '../observability/logger.js';
import { recordUnhandledError } from '../observability/metrics.js';

interface ErrorResponse {
  error: string;
  code: string;
  requestId?: string;
  correlationId?: string;
  issues?: unknown;
}

function identifiers(req: Parameters<ErrorRequestHandler>[1]): Pick<ErrorResponse, 'requestId' | 'correlationId'> {
  return { ...(req.requestId ? { requestId: req.requestId } : {}), ...(req.correlationId ? { correlationId: req.correlationId } : {}) };
}

export const notFound: RequestHandler = (req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}`, code: 'ROUTE_NOT_FOUND', ...identifiers(req) });
};

export const errorHandler: ErrorRequestHandler = (error: unknown, req, res, next) => {
  if (res.headersSent) return next(error);
  const typedError = error instanceof Error ? error : new Error('Unknown error');
  if (typedError instanceof RequestValidationError) {
    res.status(400).json({ error: typedError.message, code: typedError.code, issues: typedError.issues, ...identifiers(req) });
    return;
  }
  const mongoCode = 'code' in typedError ? typedError.code : undefined;
  const invalidJson = typedError instanceof SyntaxError && 'body' in typedError;
  const statusCode = invalidJson ? 400 : mongoCode === 11000 ? 409 : typedError instanceof multer.MulterError && typedError.code === 'LIMIT_FILE_SIZE'
    ? 413
    : typedError instanceof multer.MulterError
      ? 400
      : 'statusCode' in typedError && typeof typedError.statusCode === 'number'
        ? typedError.statusCode
        : typedError.name === 'ValidationError' ? 400 : 500;
  const code = invalidJson ? 'INVALID_JSON' : mongoCode === 11000 ? 'DUPLICATE_RECORD' : typedError instanceof multer.MulterError && typedError.code === 'LIMIT_FILE_SIZE'
    ? 'FILE_TOO_LARGE' : typedError instanceof multer.MulterError ? 'INVALID_MULTIPART' : statusCode >= 500 ? 'INTERNAL_ERROR' : `HTTP_${statusCode}`;
  const message = statusCode >= 500 ? 'Internal server error' : mongoCode === 11000 ? 'A record with the same unique value already exists' : invalidJson ? 'Request body contains invalid JSON' : typedError.message;
  if (statusCode >= 500) {
    recordUnhandledError();
    logger.error('request_failed', { error: typedError, method: req.method, path: req.path, statusCode });
  } else logger.debug('request_rejected', { errorName: typedError.name, errorMessage: typedError.message, method: req.method, path: req.path, statusCode, code });
  res.status(statusCode).json({ error: message, code, ...identifiers(req) });
};
