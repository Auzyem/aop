import { Server as SocketIOServer } from 'socket.io';
import type { Server as HttpServer } from 'http';
import Redis from 'ioredis';
import { logger } from '@aop/utils';
import { verifyAccessToken } from './lib/jwt.js';

// ---------------------------------------------------------------------------
// WebSocket server setup
// ---------------------------------------------------------------------------

/**
 * Attaches a Socket.IO server to the given HTTP server.
 *
 * Rooms:
 *   lme:prices        — receives LME price updates on every poll
 *   txn:{id}          — receives phase changes and document events for a transaction
 *
 * Redis channels consumed:
 *   lme:price:update  — published by the worker on each successful LME poll
 *   lme:price:alert   — published when a price alert threshold is breached
 */
export function setupWebSocket(httpServer: HttpServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN ?? '*',
      methods: ['GET', 'POST'],
    },
    path: '/ws',
  });

  // ---------------------------------------------------------------------------
  // JWT authentication middleware
  // ---------------------------------------------------------------------------

  io.use((socket, next) => {
    const token =
      (socket.handshake.auth.token as string | undefined) ??
      (socket.handshake.headers.authorization?.replace('Bearer ', '') as string | undefined);

    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const payload = verifyAccessToken(token);
      socket.data.user = { id: payload.sub, email: payload.email, role: payload.role };
      return next();
    } catch {
      return next(new Error('Invalid or expired token'));
    }
  });

  // ---------------------------------------------------------------------------
  // Connection handler
  // ---------------------------------------------------------------------------

  io.on('connection', (socket) => {
    logger.debug({ userId: socket.data.user?.id }, 'WebSocket client connected');

    // Subscribe to LME price room
    socket.on('subscribe:lme', () => {
      void socket.join('lme:prices');
      logger.debug({ userId: socket.data.user?.id }, 'Client subscribed to lme:prices');
    });

    // Subscribe to transaction room for real-time updates
    socket.on('subscribe:txn', (txnId: string) => {
      if (typeof txnId !== 'string' || !txnId) return;
      void socket.join(`txn:${txnId}`);
      logger.debug({ userId: socket.data.user?.id, txnId }, 'Client subscribed to txn room');
    });

    socket.on('unsubscribe:txn', (txnId: string) => {
      void socket.leave(`txn:${txnId}`);
    });

    socket.on('disconnect', (reason) => {
      logger.debug({ userId: socket.data.user?.id, reason }, 'WebSocket client disconnected');
    });
  });

  // ---------------------------------------------------------------------------
  // Redis pub/sub subscriber
  // Dedicated connection — ioredis requires separate client in subscribe mode
  // ---------------------------------------------------------------------------

  const subscriber = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    lazyConnect: true,
    maxRetriesPerRequest: 3,
  });

  subscriber.on('error', (err) => logger.warn({ err }, 'WebSocket Redis subscriber error'));

  subscriber
    .subscribe('lme:price:update', 'lme:price:alert')
    .then(() => logger.info('WebSocket subscribed to Redis LME channels'))
    .catch((err) => logger.error({ err }, 'Failed to subscribe to Redis LME channels'));

  subscriber.on('message', (channel: string, message: string) => {
    try {
      const data = JSON.parse(message) as unknown;
      if (channel === 'lme:price:update') {
        io.to('lme:prices').emit('lme:price', data);
      } else if (channel === 'lme:price:alert') {
        io.to('lme:prices').emit('lme:alert', data);
      }
    } catch (err) {
      logger.warn({ err, channel }, 'Failed to parse Redis message for WebSocket broadcast');
    }
  });

  logger.info('WebSocket server initialised');
  return io;
}

/**
 * Broadcast a transaction event to all clients subscribed to that transaction.
 * Called internally when phase changes or documents are added.
 */
export function broadcastTxnEvent(
  io: SocketIOServer,
  txnId: string,
  event: string,
  data: unknown,
): void {
  io.to(`txn:${txnId}`).emit(event, data);
}
