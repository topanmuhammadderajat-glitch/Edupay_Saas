import type { Request, Response } from 'express';
import { Prisma, type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { currentUser } from '../middleware/authMiddleware.js';
import { HttpError } from '../http.js';
import { blockingAttempts, lockInvoice, recordPayment } from '../services/paymentService.js';
import { lockInvoicePrice } from '../services/billingCalculator.js';
import { receiptSelect } from '../dto.js';

const cashInput = z.object({
  cashReceived: z.union([z.string().regex(/^\d{1,10}(\.\d{1,2})?$/), z.number().finite().nonnegative().max(9999999999.99)])
    .transform(v => new Prisma.Decimal(v)).refine(v => v.decimalPlaces() <= 2),
  transferReference: z.string().trim().min(6).max(120).optional(),
  notes: z.string().trim().max(1000).optional(),
}).strict();

export class CashierController {
  static async processCashPayment(req: Request, res: Response, db: PrismaClient) {
    const actor = currentUser(req);
    if (actor.role !== 'KASIR' && actor.role !== 'ADMIN_TU') throw new HttpError(403, 'Akses kasir ditolak');
    const input = cashInput.parse(req.body);
    const result = await db.$transaction(async tx => {
      let invoice = await lockInvoice(tx, actor.school_id, req.params.invoiceId);
      if (invoice.status !== 'PENDING') throw new HttpError(409, 'Tagihan tidak lagi menunggu pembayaran');
      const active = await tx.paymentAttempt.findFirst({ where: {
        school_id: actor.school_id, invoice_id: invoice.id, status: { in: [...blockingAttempts] },
      } });
      if (active) throw new HttpError(409, 'Pembayaran online belum selesai atau perlu rekonsiliasi');
      invoice = await lockInvoicePrice(tx, invoice);
      if (input.cashReceived.lessThan(invoice.total_amount)) throw new HttpError(400, 'Uang tunai kurang');
      const payment = await recordPayment(tx, {
        schoolId: actor.school_id, invoiceId: invoice.id, amount: invoice.total_amount,
        channel: input.transferReference ? 'MANUAL_TRANSFER' : 'CASH', transferReference: input.transferReference, actorId: actor.id, cashierId: actor.id,
        cashReceived: input.transferReference ? undefined : input.cashReceived, notes: input.notes,
      });
      return { id: payment.id, changeAmount: input.cashReceived.minus(invoice.total_amount).toFixed(2) };
    });
    const receipt = await db.paymentTransaction.findUniqueOrThrow({
      where: { school_id_id: { school_id: actor.school_id, id: result.id } }, select: receiptSelect,
    });
    res.json({ success: true, data: { receipt, changeAmount: result.changeAmount } });
  }
}
