// Two rate limiters with different budgets:
// - IoT limiter (500/min): allows burst replays when gateways reconnect after an outage.
// - API limiter (200/min): stricter general ceiling to catch scraping and polling loops.
// Both answer 429 and send RateLimit-* headers so clients can back off.
import rateLimit from 'express-rate-limit';
import { AppError, ErrorCode } from '../shared/errors/AppError';

export const BULK_INGEST_PATH = '/api/v1/sensors/readings/bulk';

// Applied only to the bulk ingest route. Thresholds come from env vars so they
// can be tuned without a code change.
export const iotRateLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? '60000', 10),
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS ?? '500', 10),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(new AppError('IoT data rate limit exceeded', ErrorCode.RATE_LIMIT_EXCEEDED, 429));
  },
});

// Applied globally in app.ts. Skips bulk ingest, which has its own higher budget;
// otherwise gateways would be capped at 200/min before the IoT limiter is reached.
export const apiRateLimiter = rateLimit({
  windowMs: 60_000,
  max: 200,
  skip: (req) => req.method === 'POST' && req.path === BULK_INGEST_PATH,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(new AppError('API rate limit exceeded', ErrorCode.RATE_LIMIT_EXCEEDED, 429));
  },
});
