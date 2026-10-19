import { databaseTable } from '../database/table.js';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { getTenantSnapClient, getGatewayCallbacks } from '../config/midtrans.js';
import { currentUser } from '../middleware/authMiddleware.js';
import { HttpError } from '../http.js';
import { invoiceDto, invoiceInclude } from '../dto.js';
import { blockingAttempts, lockInvoice } from '../services/paymentService.js';
import { lockInvoicePrice } from '../services/billingCalculator.js';

const filters = z.object({
  sort: z.enum(['due', 'recent']).default('recent'),
  status: z.enum(['PENDING', 'PAID', 'EXPIRED', 'CANCELLED']).optional(),
  grade: z.coerce.number().int().min(1).max(12).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2000).max(2200).optional(),
  studentId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
}).strict();

export function invoiceScope(req: Request): Prisma.InvoiceWhereInput {
  const actor = currentUser(req);
  if (actor.role !== 'PARENT' && actor.role !== 'KASIR' && actor.role !== 'ADMIN_TU') throw new HttpError(403, 'Peran tidak diizinkan');
  return {
    school_id: actor.school_id,
    ...(actor.role === 'PARENT' ? { student: { parent_id: actor.id, school_id: actor.school_id } } : {}),
  };
}
export class InvoiceController {
  static async getSchoolInvoices(req: Request, res: Response, db: PrismaClient) {
    const q = filters.parse(req.query);
    const where: Prisma.InvoiceWhereInput = {
      ...invoiceScope(req), status: q.status, student_id: q.studentId,
      month_period: q.month, year_period: q.year,
    };
    if (q.grade) where.AND = { student: { grade: q.grade } };
    const invoices = await db.invoice.findMany({
      where, include: invoiceInclude, take: 50, skip: (q.page - 1) * 50,
      orderBy: q.sort === 'due' ? [{ due_date: 'asc' }, { id: 'asc' }] : q.status === 'PAID' ? [{paid_at:'desc'},{id:'desc'}] : [{ created_at: 'desc' }, { id: 'desc' }],
    });
    res.json({ success: true, page: q.page, data: invoices.map(invoiceDto) });
  }
  static async getParentInvoices(req: Request, res: Response, db: PrismaClient) {
    const actor = currentUser(req);
    if (actor.role === 'PARENT' && req.params.parentId !== actor.id) throw new HttpError(403, 'Akses wali ditolak');
    const q = filters.parse(req.query);
    const invoices = await db.invoice.findMany({
      where: { ...invoiceScope(req), student: { school_id: actor.school_id, parent_id: req.params.parentId },
        student_id: q.studentId },
      include: invoiceInclude, take: 50, skip: (q.page - 1) * 50,
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
    });
    res.json({ success: true, data: invoices.map(invoiceDto) });
  }
  static async getStudentInvoices(req: Request, res: Response, db: PrismaClient) {
    const invoices = await db.invoice.findMany({
      where: { ...invoiceScope(req), student_id: req.params.studentId }, include: invoiceInclude,
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }], take: 50,
    });
    res.json({ success: true, data: invoices.map(invoiceDto) });
  }
  static async createSnapToken(req: Request, res: Response, db: PrismaClient, makeSnap = getTenantSnapClient) {
    const actor = currentUser(req);
    const scope = invoiceScope(req);
    const callbacks=getGatewayCallbacks();
    const config = await db.school.findUniqueOrThrow({where:{id:actor.school_id},select:{midtrans_server_key:true}});
    if (!config.midtrans_server_key) throw new HttpError(409, 'Pembayaran QRIS/VA belum tersedia: kredensial Midtrans sekolah belum dikonfigurasi. Gunakan loket atau transfer terverifikasi petugas.');
    const reservation = await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM ${databaseTable('schools')} WHERE id = ${actor.school_id} FOR SHARE`;
      let invoice = await lockInvoice(tx, actor.school_id, req.params.invoiceId);
      const allowed = await tx.invoice.findFirst({ where: { ...scope, id: invoice.id }, select: { id: true } });
      if (!allowed) throw new HttpError(404, 'Tagihan tidak ditemukan');
      if (invoice.status !== 'PENDING') throw new HttpError(409, 'Tagihan tidak dapat dibayar');
      const existing = await tx.paymentAttempt.findFirst({
        where: { school_id: actor.school_id, invoice_id: invoice.id, status: { in: [...blockingAttempts] } },
      });
      if (existing) {
        if (existing.status === 'READY' && existing.snap_token && existing.expires_at > new Date()) {
          return { attempt: existing, invoiceNo: invoice.invoice_no, reused: true };
        }
        // Never unblock an uncertain gateway order solely because a local timer expired.
        throw new HttpError(409, 'Order sedang diproses atau menunggu rekonsiliasi gateway');
      }
      invoice = await lockInvoicePrice(tx, invoice);
      if (invoice.total_amount.lessThanOrEqualTo(0) || !invoice.total_amount.isInteger())
        throw new HttpError(409, 'Nominal gateway harus positif dan dalam rupiah bulat');
      const attempt = await tx.paymentAttempt.create({ data: {
        school_id: actor.school_id, invoice_id: invoice.id, order_id: randomUUID(),
        amount: invoice.total_amount, expires_at: new Date(Date.now() + 60 * 60 * 1000),
      } });
      await tx.auditEvent.create({ data: {
        school_id: actor.school_id, actor_id: actor.id, action: 'PAYMENT_ATTEMPT_CREATED', entity_id: attempt.id,
      } });
      return { attempt, invoiceNo: invoice.invoice_no, reused: false };
    });
    const { attempt } = reservation;
    if (reservation.reused) {
      res.json({ success: true, snapToken: attempt.snap_token, redirectUrl: attempt.redirect_url, invoiceNo: reservation.invoiceNo });
      return;
    }
    try {
      const school = await db.school.findUniqueOrThrow({ where: { id: actor.school_id } });
      const snap = makeSnap(school);
      const response = await snap.createTransaction({
        transaction_details: { order_id: attempt.order_id, gross_amount: attempt.amount.toNumber() },
        ...(callbacks ? {callbacks} : {}),
        expiry: { unit: 'minutes', duration: 60 },
        enabled_payments: ['qris', 'gopay', 'shopeepay', 'bca_va', 'bni_va', 'bri_va', 'echannel'],
      });
      const payload = z.object({ token: z.string().min(1), redirect_url: z.string().url() }).parse(response);
      await db.$transaction(async tx => {
        await lockInvoice(tx, actor.school_id, attempt.invoice_id);
        const updated = await tx.paymentAttempt.updateMany({
          where: { id: attempt.id, school_id: actor.school_id, status: 'CREATING' },
          data: { status: 'READY', snap_token: payload.token, redirect_url: payload.redirect_url },
        });
        if (updated.count !== 1) throw new HttpError(409, 'Status order telah berubah; muat ulang tagihan');
      });
      res.json({ success: true, snapToken: payload.token, redirectUrl: payload.redirect_url, invoiceNo: reservation.invoiceNo });
    } catch (error) {
      // A timeout can happen after Midtrans accepted the order. Keep it blocked for reconciliation.
      await db.paymentAttempt.updateMany({
        where: { id: attempt.id, school_id: actor.school_id, status: 'CREATING' }, data: { status: 'REVIEW' },
      });
      if (error instanceof HttpError) throw error;
      throw new HttpError(502, 'Gateway belum mengonfirmasi order. Muat ulang; jangan membayar lewat kanal lain.');
    }
  }
}
