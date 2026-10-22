import 'dotenv/config';
// Entry point. Connects DB, starts server, registers shutdown handlers.
import { buildApp } from './app';
import { logger } from './infrastructure/logger';
import { prisma } from './infrastructure/database';

const PORT = parseInt(process.env.PORT ?? '3000', 10);

async function main() {
  await prisma.$connect();
  logger.info('Database connection established');

  const app    = buildApp();
  const server = app.listen(PORT, () => {
    logger.info('Server listening', { port: PORT });
  });

  // Graceful shutdown: stop accepting connections, drain in-flight requests,
  // then release the Prisma connection pool before exit.
  // SIGTERM is sent by Docker/Kubernetes on container stop; SIGINT is Ctrl+C.
  const shutdown = async (signal: string) => {
    logger.info('Shutdown signal received', { signal });
    server.close(async () => {
      await prisma.$disconnect();
      logger.info('Graceful shutdown complete');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error('Fatal startup error', { err });
  process.exit(1);
});
