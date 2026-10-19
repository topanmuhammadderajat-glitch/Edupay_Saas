import { DashboardController } from '../controllers/dashboardController.js';
import { ReconciliationController } from '../controllers/reconciliationController.js';
import { SchoolIdentityController } from '../controllers/schoolIdentityController.js';
import { Router, raw } from 'express';
import type { PrismaClient } from '@prisma/client';
import { rateLimit } from 'express-rate-limit';
import { authMiddleware, currentUser, requireRoles, tenantScope } from '../middleware/authMiddleware.js';
import { TenantController } from '../controllers/tenantController.js';
import { InvoiceController } from '../controllers/invoiceController.js';
import { CashierController } from '../controllers/cashierController.js';
import { WebhookController } from '../controllers/webhookController.js';
import { ReceiptController } from '../controllers/receiptController.js';
import { route } from '../http.js';

export function createApiRouter(db: PrismaClient, authenticate = authMiddleware(db), getStatus?: typeof import('../config/midtrans.js').getGatewayStatus) {
  const router = Router();
  router.post('/webhooks/midtrans', route((req, res) => WebhookController.handleMidtransNotification(req, res, db, getStatus)));
  router.get('/verify-receipt/:hash',
    rateLimit({ windowMs: 60000, limit: 60, standardHeaders: 'draft-7', legacyHeaders: false }),
    route((req, res) => ReceiptController.verify(req, res, db)));
  router.get('/school-branding/:slug', rateLimit({windowMs:60000,limit:120}), route((req,res)=>SchoolIdentityController.branding(req,res,db)));
  router.get('/school-logos/:assetId', rateLimit({windowMs:60000,limit:240}), route((req,res)=>SchoolIdentityController.publicLogo(req,res,db)));
  router.use(authenticate);
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'private, no-store'); next(); });
  router.get('/me', (req, res) => res.json({ success: true, data: currentUser(req) }));
  router.get('/schools', route((req, res) => TenantController.getAllSchools(req, res, db)));
  router.use('/schools/:schoolId', tenantScope);
  const staff = requireRoles('KASIR', 'ADMIN_TU');
  router.get('/school-assets/:assetId',staff,route((req,res)=>SchoolIdentityController.privateAsset(req,res,db)));
  router.get('/schools/:schoolId/identity',staff,route((req,res)=>SchoolIdentityController.profile(req,res,db)));
  router.put('/schools/:schoolId/identity/:kind',staff,rateLimit({windowMs:60000,limit:20}),raw({type:()=>true,limit:'1mb'}),route((req,res)=>SchoolIdentityController.upload(req,res,db)));
  const parentOrStaff = requireRoles('PARENT', 'KASIR', 'ADMIN_TU');
  router.get('/schools/:schoolId', parentOrStaff, route((req, res) => TenantController.getSchoolDetails(req, res, db)));
  router.get('/schools/:schoolId/dashboard-summary', parentOrStaff, route((req,res)=>DashboardController.summary(req,res,db)));
  router.get('/schools/:schoolId/invoices', parentOrStaff, route((req, res) => InvoiceController.getSchoolInvoices(req, res, db)));
  router.get('/schools/:schoolId/parents/:parentId/invoices', parentOrStaff,
    route((req, res) => InvoiceController.getParentInvoices(req, res, db)));
  router.get('/schools/:schoolId/parents/:parentId/children', parentOrStaff,
    route((req, res) => TenantController.getChildren(req, res, db)));
  router.get('/schools/:schoolId/students/:studentId/invoices', parentOrStaff,
    route((req, res) => InvoiceController.getStudentInvoices(req, res, db)));
  router.post('/schools/:schoolId/invoices/:invoiceId/reconcile', parentOrStaff, rateLimit({windowMs:60000,limit:20}), route((req,res)=>ReconciliationController.reconcile(req,res,db)));
  router.post('/schools/:schoolId/invoices/:invoiceId/snap-token', parentOrStaff,
    route((req, res) => InvoiceController.createSnapToken(req, res, db)));
  router.post('/schools/:schoolId/invoices/:invoiceId/pay-cash', staff,
    route((req, res) => CashierController.processCashPayment(req, res, db)));
  router.get('/schools/:schoolId/invoices/:invoiceId/invoice.pdf', parentOrStaff, route((req, res) => ReceiptController.pdf(req, res, db)));
  router.get('/schools/:schoolId/invoices/:invoiceId/receipt.pdf', parentOrStaff,
    route((req, res) => ReceiptController.pdf(req, res, db)));
  router.get('/schools/:schoolId/invoices/:invoiceId/receipt', parentOrStaff,
    route((req, res) => ReceiptController.document(req, res, db)));
  router.get('/schools/:schoolId/cash-book', staff, route(async (req, res) => {
    const school_id = currentUser(req).school_id;
    const incomes = await db.cashIncome.findMany({ where: { school_id }, orderBy: [{ date: 'desc' }, { id: 'desc' }], take: 100 });
    const expenses = await db.cashExpense.findMany({ where: { school_id }, orderBy: [{ date: 'desc' }, { id: 'desc' }], take: 100 });
    const sums = await Promise.all([
      db.cashIncome.aggregate({ where: { school_id }, _sum: { amount: true } }),
      db.cashExpense.aggregate({ where: { school_id }, _sum: { amount: true } }),
    ]);
    res.json({ success: true, data: { incomes, expenses, totalIncome: sums[0]._sum.amount ?? '0', totalExpense: sums[1]._sum.amount ?? '0' } });
  }));
  return router;
}
