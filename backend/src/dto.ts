import { priceAtCheckout } from './services/billingCalculator.js';
import { Prisma } from '@prisma/client';
export const schoolSelect = {
  id: true, npsn: true, name: true, slug: true, phone: true, address: true,
  logo_url: true, updated_at:true, level: true, invoice_cutoff_day: true, due_day_of_month: true,
} satisfies Prisma.SchoolSelect;
export const studentInclude = {
  school: { select: schoolSelect }, shuttle_route: true,
  extracurriculars: { include: { extracurricular: true } },
} satisfies Prisma.StudentInclude;
export const receiptSelect = {
  receipt_no: true, receipt_hash: true, amount: true, payment_channel: true,
  transaction_time: true, receipt_qr_code: true,
} satisfies Prisma.PaymentTransactionSelect;
export const invoiceInclude = {
  student: { include: studentInclude }, items: true, transactions: { select: receiptSelect },
} satisfies Prisma.InvoiceInclude;
export type InvoiceView = Prisma.InvoiceGetPayload<{ include: typeof invoiceInclude }>;
export function invoiceDto(invoice: InvoiceView) {
  const { snap_token: _token, snap_redirect_url: _url, ...safe } = invoice;
  const price = priceAtCheckout(invoice);
  return { ...safe, total_amount: price.total, early_bird_discount: price.early,
    items: safe.items.filter(i => price.early.gt(0) || !i.title.startsWith('Early-Bird')) };
}
