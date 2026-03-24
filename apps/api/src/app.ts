import 'dotenv/config';
import express, { type Application } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';
import { logger } from '@aop/utils';
import { router } from './routes/index.js';
import { errorHandler } from './middleware/errorHandler.js';
import { generalApiRateLimit } from './lib/rate-limits.js';

export const app: Application = express();

// Trust the first proxy (ALB / nginx in production); needed for req.ip accuracy
app.set('trust proxy', 1);

// ---------------------------------------------------------------------------
// Security headers — Helmet with explicit CSP
// ---------------------------------------------------------------------------

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"], // inline styles needed for PDF generation
        imgSrc: ["'self'", 'data:', 'https:'],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    hsts: {
      maxAge: 31_536_000, // 1 year
      includeSubDomains: true,
      preload: true,
    },
    frameguard: { action: 'deny' },
    noSniff: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    crossOriginEmbedderPolicy: false, // allow S3 pre-signed URLs to load
  }),
);

// Permissions-Policy header (not yet in Helmet core — set manually)
app.use((_req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

// ---------------------------------------------------------------------------
// CORS — never use wildcard in production
// ---------------------------------------------------------------------------

const allowedOrigin = process.env.ALLOWED_ORIGIN ?? process.env.CORS_ORIGIN;

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (server-to-server, curl, Postman in dev)
      if (!origin) return callback(null, true);

      if (process.env.NODE_ENV !== 'production') {
        // In dev/test allow all origins for convenience
        return callback(null, true);
      }

      if (!allowedOrigin) {
        logger.warn('ALLOWED_ORIGIN not set in production — rejecting cross-origin request');
        return callback(new Error('CORS: no allowed origin configured'));
      }

      if (origin === allowedOrigin) {
        return callback(null, true);
      }

      logger.warn({ origin, allowedOrigin }, 'CORS: rejected disallowed origin');
      return callback(new Error(`CORS: origin '${origin}' not allowed`));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  }),
);

// ---------------------------------------------------------------------------
// Request parsing & compression
// ---------------------------------------------------------------------------

app.use(compression());

app.use(
  morgan('combined', {
    stream: {
      write: (message: string) => {
        logger.info(message.trim());
      },
    },
  }),
);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ---------------------------------------------------------------------------
// General API rate limit (per authenticated user, 300 req/min)
// Applied after body parsing so req.user is available via earlier middleware
// ---------------------------------------------------------------------------

app.use('/api/v1', generalApiRateLimit);

// ---------------------------------------------------------------------------
// Health checks (no auth)
// ---------------------------------------------------------------------------

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    version: process.env.npm_package_version ?? '0.0.0',
    timestamp: new Date().toISOString(),
  });
});

app.get('/healthz', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ---------------------------------------------------------------------------
// API routes
// ---------------------------------------------------------------------------

app.use('/api/v1', router);

// ---------------------------------------------------------------------------
// Error handler — must be last
// ---------------------------------------------------------------------------

app.use(errorHandler);
