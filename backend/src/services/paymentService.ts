import { databaseTable } from '../database/table.js';
import { randomBytes } from 'node:crypto';
import { Prisma, type PaymentChannel } from '@prisma/client';
import { HttpError } from '../http.js';
export async function lockInvoice(tx: Prisma.TransactionClient, schoolId: string, invoiceId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM ${databaseTable('invoices')} WHERE id = ${invoiceId} AND school_id = ${schoolId} FOR UPDATE`;
  if (!rows.length) throw new HttpError(404, 'Tagihan tidak ditemukan');
  return tx.invoice.findUniqueOrThrow({ where: { school_id_id: { school_id: schoolId, id: invoiceId } } });
}
export const blockingAttempts = ['CREATING', 'READY', 'REVIEW'] as const;
export async function recordPayment(tx: Prisma.TransactionClient, input: {
  schoolId: string; invoiceId: string; amount: Prisma.Decimal; channel: PaymentChannel;
  actorId: string; cashierId?: string; cashReceived?: Prisma.Decimal; notes?: string;
  orderId?: string; gatewayStatus?: string; transferReference?: string;
}) {
  const paidAt = new Date();
  const result = await tx.invoice.updateMany({
    where: { id: input.invoiceId, school_id: input.schoolId, status: 'PENDING' },
    data: { status: 'PAID', paid_at: paidAt, payment_type: input.channel },
  });
  if (result.count !== 1) throw new HttpError(409, 'Tagihan tidak lagi menunggu pembayaran');
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit',
  }).formatToParts(paidAt);
  const period = parts.find(p => p.type === 'year')!.value + parts.find(p => p.type === 'month')!.value;
  const sequence = await tx.receiptSequence.upsert({
    where: { school_id_period: { school_id: input.schoolId, period } },
    create: { school_id: input.schoolId, period, value: 1 }, update: { value: { increment: 1 } },
  });
  const receiptNo = `KWT/${period}/${String(sequence.value).padStart(8, '0')}`;
  const hash = randomBytes(32).toString('hex');
  const base = process.env.PUBLIC_API_URL;
  if (!base) throw new HttpError(503, 'PUBLIC_API_URL belum dikonfigurasi');
  const payment = await tx.paymentTransaction.create({ data: {
    school_id: input.schoolId, invoice_id: input.invoiceId, amount: input.amount,
    payment_channel: input.channel, receipt_no: receiptNo, receipt_hash: hash,
    transaction_time: paidAt, cashier_id: input.cashierId, cash_received: input.cashReceived,
    transfer_reference: input.transferReference, cashier_notes: input.notes, midtrans_order_id: input.orderId, midtrans_status: input.gatewayStatus,
    receipt_qr_code: `${base.replace(/\/$/, '')}/api/v1/verify-receipt/${hash}`,
  } });
  await tx.cashIncome.create({ data: {
    school_id: input.schoolId, invoice_id: input.invoiceId, amount: input.amount,
    category: 'SPP_INVOICE', description: `Pelunasan ${receiptNo} via ${input.channel}`,
    received_by: input.actorId, receipt_no: receiptNo, date: paidAt,
  } });
  await tx.auditEvent.create({ data: {
    school_id: input.schoolId, actor_id: input.actorId, action: `PAYMENT_${input.channel}`, entity_id: payment.id,
  } });
  return payment;
}
