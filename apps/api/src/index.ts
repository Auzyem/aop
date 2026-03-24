import 'dotenv/config';
import http from 'http';
import { app } from './app.js';
import { setupWebSocket } from './websocket.js';
import { logger } from '@aop/utils';
import { initFxRateScheduler, shutdownFxRateScheduler } from './lib/integrations/fx/scheduler.js';

const PORT = Number(process.env.PORT ?? 3001);

// Wrap Express in an HTTP server so Socket.IO can share the connection
const server = http.createServer(app);
setupWebSocket(server);

server.listen(PORT, () => {
  logger.info({ port: PORT }, 'AOP API server started');
  initFxRateScheduler();
});

const shutdown = (signal: string) => {
  logger.info({ signal }, 'Shutdown signal received, closing server...');
  void shutdownFxRateScheduler().then(() => {
    server.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
