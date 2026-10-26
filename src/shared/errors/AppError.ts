// AppError — the single error class thrown by all service/repository layers.
// Machine-readable ErrorCode lets API clients switch without parsing the message.
/** Machine-readable error codes included in every error response body. */
export enum ErrorCode {
  // --- Domain errors (map to 4xx) ---
  SENSOR_NOT_FOUND = 'SENSOR_NOT_FOUND',
  ZONE_NOT_FOUND = 'ZONE_NOT_FOUND',
  SCHEDULE_NOT_FOUND = 'SCHEDULE_NOT_FOUND',
  IRRIGATION_EVENT_NOT_FOUND = 'IRRIGATION_EVENT_NOT_FOUND',
  EVENT_ALREADY_COMPLETED = 'EVENT_ALREADY_COMPLETED',

  // --- Infrastructure errors (map to 5xx) ---
  DATABASE_CONFLICT = 'DATABASE_CONFLICT', // 409 — unique constraint violated
  CHECK_VIOLATION = 'CHECK_VIOLATION', // 422 — CHECK constraint violated
  TRANSACTION_DEADLOCK = 'TRANSACTION_DEADLOCK', // 503 — safe to retry
  UPSTREAM_ERROR = 'UPSTREAM_ERROR', // 502 — external API (Open-Meteo) failed

  // --- Input errors (map to 4xx) ---
  VALIDATION_ERROR = 'VALIDATION_ERROR', // 422 — Zod schema rejection

  // --- Infra protection ---
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED', // 429
}

// isOperational=true → expected failure (bad input, missing record).
// isOperational=false → programmer error; triggers extra logging.
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCode;
  public readonly isOperational: boolean;
  public readonly meta?: Record<string, unknown>;

  constructor(
    message: string,
    code: ErrorCode,
    statusCode = 500,
    isOperational = true,
    meta?: Record<string, unknown>,
  ) {
    super(message);
    // Restore prototype chain so `instanceof AppError` works after transpilation.
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.meta = meta;
    // Capture stack from the call site, not from inside this constructor.
    Error.captureStackTrace(this, this.constructor);
  }

  static notFound(resource: string, id: string, code: ErrorCode): AppError {
    return new AppError(`${resource} with id "${id}" not found`, code, 404);
  }

  static validation(message: string, meta?: Record<string, unknown>): AppError {
    return new AppError(message, ErrorCode.VALIDATION_ERROR, 422, true, meta);
  }
}
