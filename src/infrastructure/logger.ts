// Winston logger — colorised in dev, JSON in prod, rotating files for both.
// Log level is controlled by LOG_LEVEL so verbosity can change without a redeploy.
import winston from 'winston';

const { combine, timestamp, json, colorize, simple } = winston.format;

const isDev = process.env.NODE_ENV !== 'production';

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL ?? 'info',
  format: combine(timestamp(), json()),
  defaultMeta: { service: 'irrigation-api' },
  transports: [
    // Colorised for dev scanning; JSON for log shippers in prod.
    new winston.transports.Console({
      format: isDev ? combine(colorize(), simple()) : combine(timestamp(), json()),
    }),

    // Error-only file — focused trail for on-call.
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
      tailable: true,
    }),

    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
      tailable: true,
    }),
  ],

  // Uncaught exceptions and rejections go to dedicated files so they survive
  // even if the crash itself breaks the normal log pipeline.
  exceptionHandlers: [new winston.transports.File({ filename: 'logs/exceptions.log' })],
  rejectionHandlers: [new winston.transports.File({ filename: 'logs/rejections.log' })],
});
