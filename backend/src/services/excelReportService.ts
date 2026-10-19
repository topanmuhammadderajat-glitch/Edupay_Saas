/**
 * EduPay SaaS - Excel Financial Statement Generator Service
 * Formats standardized accounting reports with official School Letterhead,
 * clean borders, auto-width columns, currency formatting, and automated SUM totals.
 */

export interface FinancialStatementItem {
  id: string;
  date: string;
  voucherNo: string;
  type: 'INCOME' | 'EXPENSE';
  category: string;
  description: string;
  incomeAmount: number;
  expenseAmount: number;
  balanceAfter: number;
  pic: string;
}

export interface SchoolLetterheadInfo {
  schoolName: string;
  kopSuratTitle: string;
  kopSuratSubtitle: string;
  address: string;
  phone: string;
  email: string;
  headmasterName: string;
  treasurerName: string;
}

export class ExcelReportService {
  /**
   * Builds structured worksheet matrix data ready for XLSX / ExcelJS export
   */
  public static generateWorksheetData(
    school: SchoolLetterheadInfo,
    periodLabel: string,
    items: FinancialStatementItem[]
  ) {
    const rows: (string | number)[][] = [];

    // 1. Kop Surat Header
    rows.push([school.kopSuratTitle.toUpperCase()]);
    rows.push([school.kopSuratSubtitle.toUpperCase()]);
    rows.push([`${school.address} • Telp: ${school.phone} • Email: ${school.email}`]);
    rows.push(['========================================================================================']);
    rows.push([]);
    rows.push(['LAPORAN ARUS KAS & BUKU KAS UMUM (GENERAL LEDGER)']);
    rows.push([`Periode Laporan: ${periodLabel}`]);
    rows.push([]);

    // 2. Table Column Headers
    rows.push([
      'NO',
      'TANGGAL',
      'NO. BUKTI',
      'JENIS KAS',
      'KATEGORI',
      'URAIAN / KETERANGAN TRANSAKSI',
      'PEMASUKAN (DEBIT)',
      'PENGELUARAN (KREDIT)',
      'SALDO BERJALAN',
      'PENANGGUNG JAWAB',
    ]);

    let totalIn = 0;
    let totalOut = 0;

    // 3. Transactions data
    items.forEach((item, idx) => {
      totalIn += item.incomeAmount;
      totalOut += item.expenseAmount;

      rows.push([
        idx + 1,
        item.date,
        item.voucherNo,
        item.type === 'INCOME' ? 'Pemasukan' : 'Pengeluaran',
        item.category,
        item.description,
        item.incomeAmount,
        item.expenseAmount,
        item.balanceAfter,
        item.pic,
      ]);
    });

    const netBalance = totalIn - totalOut;

    // 4. Accounting Summary Totals
    rows.push([]);
    rows.push([
      '',
      '',
      '',
      '',
      '',
      'TOTAL PEMASUKAN KAS (DEBIT)',
      totalIn,
      '',
      '',
      '',
    ]);
    rows.push([
      '',
      '',
      '',
      '',
      '',
      'TOTAL PENGELUARAN KAS (KREDIT)',
      '',
      totalOut,
      '',
      '',
    ]);
    rows.push([
      '',
      '',
      '',
      '',
      '',
      'SISA SALDO KAS RIIL (NET BALANCE)',
      '',
      '',
      netBalance,
      '',
    ]);

    // 5. Official Signature Block
    rows.push([]);
    rows.push([]);
    rows.push(['', '', '', '', 'Mengetahui,', '', '', '', 'Disusun oleh,']);
    rows.push(['', '', '', '', 'Kepala Sekolah', '', '', '', 'Bendahara Keuangan']);
    rows.push([]);
    rows.push([]);
    rows.push(['', '', '', '', `(${school.headmasterName})`, '', '', '', `(${school.treasurerName})`]);

    return {
      rows,
      summary: {
        totalIncome: totalIn,
        totalExpense: totalOut,
        netBalance,
      },
    };
  }
}
