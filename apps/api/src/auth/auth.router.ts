import { Router, type IRouter } from 'express';
import { validateRequest } from '../middleware/validateRequest.js';
import { authenticate } from '../middleware/rbac.js';
import { loginRateLimit, totpRateLimit } from '../lib/rate-limits.js';
import { LoginSchema, TotpVerifySchema, RefreshSchema, LogoutSchema } from './auth.schemas.js';
import {
  loginHandler,
  totpVerifyHandler,
  totpSetupHandler,
  refreshHandler,
  logoutHandler,
} from './auth.controller.js';

export const authRouter: IRouter = Router();

// Rate-limited auth endpoints
authRouter.post('/login', loginRateLimit, validateRequest(LoginSchema), loginHandler);
authRouter.post(
  '/totp/verify',
  totpRateLimit,
  validateRequest(TotpVerifySchema),
  totpVerifyHandler,
);
authRouter.post('/totp/setup', authenticate(), totpSetupHandler);
authRouter.post('/refresh', validateRequest(RefreshSchema), refreshHandler);
authRouter.post('/logout', validateRequest(LogoutSchema), logoutHandler);
