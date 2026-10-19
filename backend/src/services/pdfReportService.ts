/**
 * EduPay SaaS - PDF Financial Statement & Direct Print Service
 * Generates formal A4 report with dynamic School Kop Surat, accounting layout,
 * and official signatures (Bendahara & Kepala Sekolah).
 */

import { FinancialStatementItem, SchoolLetterheadInfo } from './excelReportService.js';

export class PdfReportService {
  public static generateHtmlReport(
    school: SchoolLetterheadInfo,
    periodLabel: string,
    items: FinancialStatementItem[],
    summary: { totalIncome: number; totalExpense: number; netBalance: number }
  ): string {
    const fmt = (n: number) => 'Rp ' + n.toLocaleString('id-ID');

    const tableRows = items
      .map(
        (it, idx) => `
        <tr class="border-b border-gray-200">
          <td class="py-2 px-2 text-center text-xs text-gray-500">${idx + 1}</td>
          <td class="py-2 px-2 text-xs font-mono">${it.date}</td>
          <td class="py-2 px-2 text-xs font-mono font-medium">${it.voucherNo}</td>
          <td class="py-2 px-2 text-xs">
            <span class="px-1.5 py-0.5 rounded text-[10px] font-bold ${
              it.type === 'INCOME' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
            }">
              ${it.type === 'INCOME' ? 'Masuk' : 'Keluar'}
            </span>
          </td>
          <td class="py-2 px-2 text-xs font-medium text-gray-700">${it.category}</td>
          <td class="py-2 px-2 text-xs text-gray-900">${it.description}</td>
          <td class="py-2 px-2 text-xs text-right font-mono font-semibold text-green-700">
            ${it.incomeAmount > 0 ? fmt(it.incomeAmount) : '-'}
          </td>
          <td class="py-2 px-2 text-xs text-right font-mono font-semibold text-red-700">
            ${it.expenseAmount > 0 ? fmt(it.expenseAmount) : '-'}
          </td>
          <td class="py-2 px-2 text-xs text-right font-mono font-bold text-gray-900">
            ${fmt(it.balanceAfter)}
          </td>
        </tr>
      `
      )
      .join('');

    return `
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>Laporan Arus Kas - ${school.schoolName}</title>
  <style>
    @page { size: A4 landscape; margin: 15mm; }
    body { font-family: 'Plus Jakarta Sans', Arial, sans-serif; color: #1e293b; line-height: 1.4; margin: 0; padding: 20px; }
    .kop-container { border-bottom: 3px double #0f172a; padding-bottom: 12px; margin-bottom: 16px; text-align: center; }
    .kop-title { font-size: 15pt; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase; margin: 0; }
    .kop-subtitle { font-size: 18pt; font-weight: 900; color: #0f766e; text-transform: uppercase; margin: 2px 0; }
    .kop-address { font-size: 9pt; color: #475569; margin: 0; }
    .report-title { font-size: 12pt; font-weight: 800; text-align: center; text-transform: uppercase; margin-top: 10px; }
    .report-period { font-size: 10pt; text-align: center; color: #64748b; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 9pt; }
    th { background-color: #f1f5f9; color: #334155; font-weight: 700; text-transform: uppercase; font-size: 8pt; border: 1px solid #cbd5e1; padding: 6px; }
    td { border: 1px solid #cbd5e1; padding: 6px; }
    .total-row { background-color: #f8fafc; font-weight: 800; font-size: 10pt; }
    .signature-container { margin-top: 35px; display: flex; justify-content: space-between; page-break-inside: avoid; }
    .sig-box { width: 220px; text-align: center; font-size: 10pt; }
    .sig-line { margin-top: 60px; font-weight: bold; border-bottom: 1px solid #334155; padding-bottom: 2px; }
  </style>
</head>
<body>
  <div class="kop-container">
    <div class="kop-title">${school.kopSuratTitle}</div>
    <div class="kop-subtitle">${school.kopSuratSubtitle}</div>
    <div class="kop-address">${school.address} • Telp: ${school.phone} • Email: ${school.email}</div>
  </div>

  <div class="report-title">BUKU KAS UMUM & LAPORAN ARUS KAS (CASH FLOW)</div>
  <div class="report-period">Periode Transaksi: ${periodLabel}</div>

  <table>
    <thead>
      <tr>
        <th style="width: 25px;">No</th>
        <th style="width: 80px;">Tanggal</th>
        <th style="width: 100px;">No. Bukti</th>
        <th style="width: 60px;">Jenis</th>
        <th style="width: 120px;">Kategori</th>
        <th>Uraian / Keterangan</th>
        <th style="width: 110px;">Pemasukan (Debit)</th>
        <th style="width: 110px;">Pengeluaran (Kredit)</th>
        <th style="width: 120px;">Saldo Berjalan</th>
      </tr>
    </thead>
    <tbody>
      ${tableRows}
      <tr class="total-row">
        <td colspan="6" style="text-align: right; padding-right: 12px;">TOTAL PEMASUKAN KAS (DEBIT)</td>
        <td style="text-align: right; color: #15803d;">${fmt(summary.totalIncome)}</td>
        <td colspan="2"></td>
      </tr>
      <tr class="total-row">
        <td colspan="6" style="text-align: right; padding-right: 12px;">TOTAL PENGELUARAN KAS (KREDIT)</td>
        <td></td>
        <td style="text-align: right; color: #b91c1c;">${fmt(summary.totalExpense)}</td>
        <td></td>
      </tr>
      <tr class="total-row" style="background-color: #ecfdf5;">
        <td colspan="6" style="text-align: right; padding-right: 12px; font-weight: 900; color: #065f46;">
          SISA SALDO KAS RIIL (NET CASH BALANCE)
        </td>
        <td colspan="2"></td>
        <td style="text-align: right; font-weight: 900; color: #047857; font-size: 11pt;">
          ${fmt(summary.netBalance)}
        </td>
      </tr>
    </tbody>
  </table>

  <div class="signature-container">
    <div class="sig-box">
      <div>Mengetahui,</div>
      <div>Kepala Sekolah</div>
      <div class="sig-line">${school.headmasterName}</div>
      <div style="font-size: 8pt; color: #64748b;">NIP: 19780512 200501 1 002</div>
    </div>
    <div class="sig-box">
      <div>Jakarta, ${new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
      <div>Bendahara Keuangan Sekolah</div>
      <div class="sig-line">${school.treasurerName}</div>
      <div style="font-size: 8pt; color: #64748b;">NIP: 19850214 201001 2 005</div>
    </div>
  </div>
</body>
</html>
    `;
  }
}
