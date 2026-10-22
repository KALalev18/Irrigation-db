// Two rate limiters with different budgets:
// - IoT limiter (500/min): allows burst replays when gateways reconnect after an outage.
// - API limiter (200/min): stricter general ceiling to catch scraping and polling loops.
// Both send RateLimit-* headers (RFC 6585) so clients can back off automatically.
import rateLimit from 'express-rate-limit';
import { AppError, ErrorCode } from '../shared/errors/AppError';

// Applied only to POST /api/v1/sensors/readings/bulk.
// Thresholds are env-configurable so they can be tuned in prod without a redeploy.
export const iotRateLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? '60000', 10),
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS ?? '500', 10),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(new AppError('IoT data rate limit exceeded', ErrorCode.RATE_LIMIT_EXCEEDED, 429));
  },
});

// Applied globally in app.ts.
export const apiRateLimiter = rateLimit({
  windowMs: 60_000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(new AppError('API rate limit exceeded', ErrorCode.RATE_LIMIT_EXCEEDED, 429));
  },
});
