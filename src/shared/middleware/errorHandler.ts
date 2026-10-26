// Global Express error handler — last middleware in app.ts.
// Normalises AppError, ZodError, Prisma errors, and unknown throws into
// a consistent { error: { code, message, meta? } } response shape.
import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { AppError, ErrorCode } from '../errors/AppError';
import { logger } from '../../infrastructure/logger';

export function globalErrorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  // --- 1. Known operational domain error ---
  if (err instanceof AppError) {
    if (!err.isOperational) {
      logger.error('Non-operational AppError', { err });
    }
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, ...(err.meta && { meta: err.meta }) },
    });
    return;
  }

  // --- 2. Zod validation failure ---
  if (err instanceof ZodError) {
    res.status(422).json({
      error: {
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Validation failed',
        // Full field-level issues let clients surface them per-field without a second request.
        meta: { issues: err.issues },
      },
    });
    return;
  }

  // --- 3. Prisma known error codes ---
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2034') {
      // Serialization failure — safe for client to retry.
      res.status(503).json({
        error: { code: ErrorCode.TRANSACTION_DEADLOCK, message: 'Transaction deadlock — retry' },
      });
      return;
    }
    if (err.code === 'P2002') {
      res.status(409).json({
        error: {
          code: ErrorCode.DATABASE_CONFLICT,
          message: 'Unique constraint violated',
          meta: { fields: err.meta?.target },
        },
      });
      return;
    }
  }

  // --- 4. Prisma query construction error (likely a bug in a repository) ---
  if (err instanceof Prisma.PrismaClientValidationError) {
    logger.warn('Prisma validation error', { err });
    res.status(400).json({
      error: { code: ErrorCode.VALIDATION_ERROR, message: 'Database query validation failed' },
    });
    return;
  }

  // --- 5. CHECK constraint (Postgres 23514). Prisma doesn't map these to a code. ---
  if (err instanceof Prisma.PrismaClientUnknownRequestError && err.message.includes('"23514"')) {
    const constraint = /check constraint \\?"([a-z0-9_]+)\\?"/.exec(err.message)?.[1];
    res.status(422).json({
      error: {
        code: ErrorCode.CHECK_VIOLATION,
        message: 'Value rejected by a database constraint',
        ...(constraint && { meta: { constraint } }),
      },
    });
    return;
  }

  // --- 6. Unknown — never leak internals ---
  logger.error('Unhandled exception', { err });
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
  });
}
