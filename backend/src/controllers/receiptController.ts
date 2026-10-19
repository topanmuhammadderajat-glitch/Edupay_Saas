import { loadSchoolIdentity } from '../services/schoolIdentityService.js';
import { priceAtCheckout } from '../services/billingCalculator.js';
import { generateReceiptPdf } from '../services/receiptPdfService.js';
import type { Request, Response } from 'express';
import type { PrismaClient } from '@prisma/client';
import QRCode from 'qrcode';
import { HttpError } from '../http.js';
import { currentUser } from '../middleware/authMiddleware.js';
import { receiptSelect, schoolSelect } from '../dto.js';
import { invoiceScope } from './invoiceController.js';

const escape = (value: unknown) => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]!));
export class ReceiptController {
  static async verify(req: Request, res: Response, db: PrismaClient) {
    if (!/^[a-f0-9]{64}$/.test(req.params.hash)) throw new HttpError(404, 'Kuitansi tidak ditemukan');
    const receipt = await db.paymentTransaction.findUnique({
      where: { receipt_hash: req.params.hash }, select: {
        receipt_no: true, transaction_time: true, school: { select: { name: true } },
        invoice: { select: { status: true } },
      },
    });
    if (!receipt) throw new HttpError(404, 'Kuitansi tidak ditemukan');
    res.setHeader('Cache-Control', 'no-store');
    res.json({ valid: receipt.invoice.status === 'PAID', receiptNo: receipt.receipt_no,
      schoolName: receipt.school.name, issuedAt: receipt.transaction_time });
  }
  static async pdf(req: Request, res: Response, db: PrismaClient) {
    const billOnly = req.path.endsWith('/invoice.pdf');
    const invoice = await db.invoice.findFirst({
      where: { ...invoiceScope(req), id: req.params.invoiceId, ...(billOnly ? {} : {status: 'PAID' as const}) },
      select: {
        invoice_no: true, status: true, total_amount: true, due_date: true, pricing_locked_at:true, early_bird_discount:true,year_period:true,month_period:true,early_bird_cutoff_day:true,spp_amount:true,shuttle_amount:true,extracurricular_amount:true,registration_amount:true,sibling_discount:true, student: { select: { full_name: true, nis: true } },
        school: { select: { id:true, name: true,logo_url:true,stamp_url:true,signature_url:true,profile:{select:{treasurer_name:true}} } }, transactions: { select: receiptSelect },
      },
    });
    const receipt = invoice?.transactions[0];
    if (!invoice || (!billOnly && !receipt?.receipt_qr_code)) throw new HttpError(404, 'Kuitansi lunas tidak ditemukan');
    const identity = await loadSchoolIdentity(db,invoice.school);
    const pdf = await generateReceiptPdf({
      ...identity,
      schoolId: invoice.school.id, treasurerName: invoice.school.profile?.treasurer_name, schoolName: invoice.school.name, receiptNo: receipt?.receipt_no ?? "-", status: invoice.status, invoiceNo: invoice.invoice_no,
      studentName: invoice.student.full_name, nis: invoice.student.nis,
      amount: (receipt?.amount ?? priceAtCheckout(invoice).total).toFixed(2), channel: receipt?.payment_channel ?? '-',
      paidAt: receipt?.transaction_time ?? invoice.due_date, verificationUrl: receipt?.receipt_qr_code ?? "",
    });
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Disposition', 'attachment; filename="kuitansi-' + req.params.invoiceId.replace(/[^a-zA-Z0-9-]/g, '') + '.pdf"');
    res.type('application/pdf').send(pdf);
  }
  static async document(req: Request, res: Response, db: PrismaClient) {
    const actor = currentUser(req);
    const invoice = await db.invoice.findFirst({
      where: { ...invoiceScope(req), id: req.params.invoiceId, status: 'PAID' },
      select: {
        invoice_no: true, student: { select: { full_name: true, nis: true } },
        school: { select: schoolSelect }, transactions: { select: receiptSelect },
      },
    });
    if (!invoice?.transactions[0]) throw new HttpError(404, 'Kuitansi lunas tidak ditemukan');
    const receipt = invoice.transactions[0];
    const qr = await QRCode.toDataURL(receipt.receipt_qr_code!, { width: 160, margin: 1 });
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src data:; style-src 'unsafe-inline'; frame-ancestors 'none'");
    res.type('html').send(`<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Kuitansi ${escape(receipt.receipt_no)}</title>
      <style>body{font:16px Arial;max-width:720px;margin:40px auto;color:#123}h1{border-bottom:2px solid;padding-bottom:16px}dt{font-weight:bold;margin-top:14px}dd{margin:4px 0}@page{size:A4;margin:20mm}</style></head>
      <body><h1>${escape(invoice.school.name)}</h1><h2>Kuitansi Pembayaran — LUNAS</h2><dl>
      <dt>Nomor kuitansi</dt><dd>${escape(receipt.receipt_no)}</dd><dt>Tagihan</dt><dd>${escape(invoice.invoice_no)}</dd>
      <dt>Siswa / NIS</dt><dd>${escape(invoice.student.full_name)} / ${escape(invoice.student.nis)}</dd>
      <dt>Nominal</dt><dd>Rp ${escape(receipt.amount.toFixed(2))}</dd><dt>Kanal</dt><dd>${escape(receipt.payment_channel)}</dd>
      <dt>Waktu pembayaran</dt><dd>${escape(receipt.transaction_time.toISOString())}</dd></dl>
      <img alt="QR verifikasi kuitansi" src="${qr}"><p>Scan QR untuk memverifikasi keaslian dokumen.</p></body></html>`);
  }
}
