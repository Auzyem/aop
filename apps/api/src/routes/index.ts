import { Router, type IRouter } from 'express';
import { authRouter } from '../auth/auth.router.js';
import { clientsRouter } from '../modules/clients/clients.router.js';
import { transactionsRouter } from '../modules/transactions/transactions.router.js';
import { documentsRouter } from '../modules/documents/documents.router.js';
import { financeRouter } from '../modules/finance/finance.router.js';
import { lmeRouter } from '../modules/lme/lme.router.js';
import { settlementRouter } from '../modules/settlement/settlement.router.js';
import { reportingRouter } from '../modules/reporting/reporting.router.js';
import { adminRouter } from '../modules/admin/admin.router.js';

export const router: IRouter = Router();

router.use('/auth', authRouter);
router.use('/clients', clientsRouter);
router.use('/transactions', transactionsRouter);
router.use('/documents', documentsRouter);
router.use('/finance', financeRouter);
router.use('/lme', lmeRouter);
router.use('/settlements', settlementRouter);
router.use('/reports', reportingRouter);
router.use('/admin', adminRouter);

router.get('/', (_req, res) => {
  res.json({ service: 'AOP API', version: '1' });
});
