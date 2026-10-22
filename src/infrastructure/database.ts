// Singleton PrismaClient — one instance manages the connection pool.
// Multiple instances would exhaust max_connections under load.
import { PrismaClient } from '@prisma/client';
import { logger } from './logger';

const prisma = new PrismaClient({
  // Emit as Node.js events so Winston handles all log output — no mixing stdout streams.
  log: [
    { emit: 'event', level: 'query' },
    { emit: 'event', level: 'warn' },
    { emit: 'event', level: 'error' },
  ],
});

// Queries go to debug level — suppressed in prod unless LOG_LEVEL=debug.
prisma.$on('query', (e: { query: string; params: string; duration: number }) => {
  logger.debug('Prisma query', { query: e.query, params: e.params, durationMs: e.duration });
});

prisma.$on('warn', (e: { message: string }) => {
  logger.warn('Prisma warning', { message: e.message });
});

prisma.$on('error', (e: { message: string }) => {
  logger.error('Prisma error', { message: e.message });
});

export { prisma };
