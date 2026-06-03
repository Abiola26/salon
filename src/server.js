'use strict';

const app = require('./app');
const { connectDB } = require('./config/db');
const { PORT, NODE_ENV } = require('./config/env');
const logger = require('./config/logger');
const { initSchedulers } = require('./utils/scheduler');

const startServer = async () => {
  // Connect to database first
  await connectDB();

  // Start cron schedulers
  initSchedulers();

  const server = app.listen(PORT, () => {
    logger.info(`🚀 Server running in ${NODE_ENV} mode on port ${PORT}`);
    logger.info(`📖 API Base URL: http://localhost:${PORT}/api`);
    logger.info(`❤️  Health Check: http://localhost:${PORT}/api/health`);
  });

  // ─── Graceful Shutdown ──────────────────────────────────────────────────────
  const gracefulShutdown = async (signal) => {
    logger.info(`${signal} received — shutting down gracefully`);

    server.close(async () => {
      logger.info('HTTP server closed');

      const { prisma } = require('./config/db');
      await prisma.$disconnect();
      logger.info('Database connection closed');

      process.exit(0);
    });

    // Force-kill after 10 seconds
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10_000);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error(`Unhandled Rejection: ${reason}`);
    gracefulShutdown('UNHANDLED_REJECTION');
  });

  process.on('uncaughtException', (error) => {
    logger.error(`Uncaught Exception: ${error.message}`);
    gracefulShutdown('UNCAUGHT_EXCEPTION');
  });
};

startServer();
