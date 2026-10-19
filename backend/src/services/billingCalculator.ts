import { Prisma, type Invoice } from '@prisma/client';
import { HttpError } from '../http.js';

export interface BillingInput {
  schoolId: string; studentId: string; grade: number; monthPeriod: number; yearPeriod: number;
  gradeFee: { sppAmount: number; registrationFee: number; earlyBirdDiscount: number; earlyBirdCutoffDay: number; siblingDiscountPct: number };
  shuttle?: { type: 'NONE' | 'ONE_WAY' | 'TWO_WAY'; feeOneWay: number; feeTwoWay: number; zoneName: string } | null;
  extracurriculars: { id: string; name: string; monthlyFee: number }[];
  siblingCount: number; paymentDayOfMonth?: number; includeRegistrationFee?: boolean;
}
export function calculateStudentInvoice(input: BillingInput) {
  const d = (n: number) => {
    if (!Number.isSafeInteger(n) || n < 0) throw new HttpError(400, 'Tarif harus dalam rupiah bulat dan tidak negatif');
    return new Prisma.Decimal(n);
  };
  const fee = input.gradeFee;
  if (!Number.isFinite(fee.siblingDiscountPct) || fee.siblingDiscountPct < 0 || fee.siblingDiscountPct > 100)
    throw new HttpError(400, 'Persentase diskon tidak valid');
  const spp = d(fee.sppAmount);
  const shuttle = input.shuttle?.type === 'TWO_WAY' ? d(input.shuttle.feeTwoWay) :
    input.shuttle?.type === 'ONE_WAY' ? d(input.shuttle.feeOneWay) : d(0);
  const extras = input.extracurriculars.reduce((sum, e) => sum.plus(d(e.monthlyFee)), d(0));
  const registration = input.includeRegistrationFee ? d(fee.registrationFee) : d(0);
  const sibling = input.siblingCount > 1 ? spp.times(fee.siblingDiscountPct).div(100).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP) : d(0);
  const subtotal = spp.plus(shuttle).plus(extras).plus(registration);
  const early = input.paymentDayOfMonth !== undefined && input.paymentDayOfMonth <= fee.earlyBirdCutoffDay ?
    Prisma.Decimal.min(d(fee.earlyBirdDiscount), Prisma.Decimal.max(0, subtotal.minus(sibling))) : d(0);
  const total = Prisma.Decimal.max(0, subtotal.minus(sibling).minus(early));
  const breakdownItems = [
    { category: 'SPP', title: `SPP Bulanan (Kelas ${input.grade})`, amount: spp.toNumber() },
    ...(shuttle.gt(0) ? [{ category: 'SHUTTLE', title: 'Antar-Jemput', amount: shuttle.toNumber() }] : []),
    ...input.extracurriculars.map(e => ({ category: 'EXTRACURRICULAR', title: `Ekskul: ${e.name}`, amount: e.monthlyFee })),
    ...(registration.gt(0) ? [{ category: 'REGISTRATION', title: 'Daftar Ulang', amount: registration.toNumber() }] : []),
    ...(sibling.gt(0) ? [{ category: 'DISCOUNT', title: 'Sibling Discount', amount: sibling.negated().toNumber() }] : []),
    ...(early.gt(0) ? [{ category: 'DISCOUNT', title: 'Early-Bird Bonus', amount: early.negated().toNumber() }] : []),
  ];
  return {
    sppAmount: spp.toNumber(), shuttleAmount: shuttle.toNumber(), extracurricularAmount: extras.toNumber(),
    registrationAmount: registration.toNumber(), earlyBirdDiscount: early.toNumber(),
    siblingDiscount: sibling.toNumber(), subtotal: subtotal.toNumber(),
    totalDiscount: sibling.plus(early).toNumber(), totalAmount: total.toNumber(), breakdownItems,
  };
}
type InvoicePrice = Pick<Invoice, 'pricing_locked_at'|'total_amount'|'early_bird_discount'|'year_period'|'month_period'|'early_bird_cutoff_day'|'spp_amount'|'shuttle_amount'|'extracurricular_amount'|'registration_amount'|'sibling_discount'>;
export function priceAtCheckout(invoice: InvoicePrice, now = new Date()) {
  if (invoice.pricing_locked_at) return { total: invoice.total_amount, early: invoice.early_bird_discount };
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const n = (key: string) => Number(parts.find(p => p.type === key)!.value);
  const current = n('year') * 10000 + n('month') * 100 + n('day');
  const cutoff = invoice.year_period * 10000 + invoice.month_period * 100 + invoice.early_bird_cutoff_day;
  const early = current <= cutoff ? invoice.early_bird_discount : new Prisma.Decimal(0);
  const total = Prisma.Decimal.max(0, invoice.spp_amount.plus(invoice.shuttle_amount)
    .plus(invoice.extracurricular_amount).plus(invoice.registration_amount).minus(invoice.sibling_discount).minus(early));
  return { total, early };
}
export async function lockInvoicePrice(tx: Prisma.TransactionClient, invoice: Invoice) {
  if (invoice.pricing_locked_at) return invoice;
  const { total, early } = priceAtCheckout(invoice);
  if (!early.equals(invoice.early_bird_discount)) {
    await tx.invoiceItem.deleteMany({ where: {
      school_id: invoice.school_id, invoice_id: invoice.id, category: 'DISCOUNT', title: { startsWith: 'Early-Bird' },
    } });
  }
  return tx.invoice.update({
    where: { school_id_id: { school_id: invoice.school_id, id: invoice.id } },
    data: { total_amount: total, early_bird_discount: early, pricing_locked_at: new Date() },
  });
}
export function invoicePriceSql(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const n=(key:string)=>Number(parts.find(p=>p.type===key)!.value);
  const today=n('year')*10000+n('month')*100+n('day');
  return Prisma.sql`CASE WHEN i.pricing_locked_at IS NOT NULL THEN i.total_amount
    ELSE GREATEST(0, i.spp_amount+i.shuttle_amount+i.extracurricular_amount+i.registration_amount-i.sibling_discount-
      CASE WHEN (i.year_period*10000+i.month_period*100+i.early_bird_cutoff_day)>=${today} THEN i.early_bird_discount ELSE 0 END) END`;
}
