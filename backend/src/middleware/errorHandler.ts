import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { ApiFailure } from '../types/api';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(AppError.notFound(`Route ${req.method} ${req.path} not found`));
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof AppError) {
    const body: ApiFailure = { success: false, error: { code: err.code, message: err.message, details: err.details } };
    res.status(err.status).json(body);
    return;
  }

  // Malformed JSON bodies / oversized payloads from express.json()
  const status = typeof err?.status === 'number' ? err.status : undefined;
  if (status === 400 || status === 413) {
    const body: ApiFailure = {
      success: false,
      error: { code: 'BAD_REQUEST', message: status === 413 ? 'Request body too large' : 'Malformed request body' },
    };
    res.status(status).json(body);
    return;
  }

  (req.log ?? logger).error({ err }, 'Unhandled error');
  const body: ApiFailure = { success: false, error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } };
  res.status(500).json(body);
};
