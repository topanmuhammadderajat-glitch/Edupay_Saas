/**
 * EduPay SaaS - Bulk Student Import Service
 * Parses Excel / CSV spreadsheets, validates data integrity, and performs batch insertion.
 */

export interface ExcelStudentRow {
  NISN: string;
  NIS: string;
  Nama_Lengkap: string;
  Jenjang_Kelas: number | string;
  Nama_Wali: string;
  No_WhatsApp: string;
  Status_Jemputan: 'YA' | 'TIDAK';
  ID_Rute_Jemputan?: string;
  Ekstrakurikuler_Diambil?: string; // Comma separated, e.g. "ROBO, TAHFIDZ"
}

export interface ImportErrorDetail {
  rowNumber: number;
  nisn?: string;
  nis?: string;
  studentName?: string;
  field: string;
  message: string;
}

export interface ImportValidationResult {
  totalRows: number;
  validRowsCount: number;
  invalidRowsCount: number;
  validRows: ExcelStudentRow[];
  errors: ImportErrorDetail[];
}

export class StudentImportService {
  /**
   * Validates parsed spreadsheet rows before database persistence
   */
  public static validateStudentData(
    rows: ExcelStudentRow[],
    existingNisns: Set<string>,
    existingNisList: Set<string>
  ): ImportValidationResult {
    const validRows: ExcelStudentRow[] = [];
    const errors: ImportErrorDetail[] = [];
    const seenNisnsInFile = new Set<string>();
    const seenNisInFile = new Set<string>();

    rows.forEach((row, index) => {
      const rowNum = index + 2; // Excel header is row 1
      let rowHasError = false;

      // 1. Validate NISN (10 digits numeric)
      const nisnStr = String(row.NISN || '').trim();
      if (!nisnStr) {
        errors.push({ rowNumber: rowNum, studentName: row.Nama_Lengkap, field: 'NISN', message: 'NISN wajib diisi' });
        rowHasError = true;
      } else if (!/^\d{10}$/.test(nisnStr)) {
        errors.push({ rowNumber: rowNum, studentName: row.Nama_Lengkap, field: 'NISN', message: 'NISN harus tepat 10 digit angka' });
        rowHasError = true;
      } else if (seenNisnsInFile.has(nisnStr)) {
        errors.push({ rowNumber: rowNum, studentName: row.Nama_Lengkap, field: 'NISN', message: `NISN duplikat di dalam file: ${nisnStr}` });
        rowHasError = true;
      } else if (existingNisns.has(nisnStr)) {
        errors.push({ rowNumber: rowNum, studentName: row.Nama_Lengkap, field: 'NISN', message: `NISN sudah terdaftar di database: ${nisnStr}` });
        rowHasError = true;
      }

      // 2. Validate NIS
      const nisStr = String(row.NIS || '').trim();
      if (!nisStr) {
        errors.push({ rowNumber: rowNum, studentName: row.Nama_Lengkap, field: 'NIS', message: 'NIS wajib diisi' });
        rowHasError = true;
      } else if (seenNisInFile.has(nisStr)) {
        errors.push({ rowNumber: rowNum, studentName: row.Nama_Lengkap, field: 'NIS', message: `NIS duplikat di dalam file: ${nisStr}` });
        rowHasError = true;
      } else if (existingNisList.has(nisStr)) {
        errors.push({ rowNumber: rowNum, studentName: row.Nama_Lengkap, field: 'NIS', message: `NIS sudah digunakan siswa lain: ${nisStr}` });
        rowHasError = true;
      }

      // 3. Validate Nama Lengkap
      if (!row.Nama_Lengkap || String(row.Nama_Lengkap).trim().length < 3) {
        errors.push({ rowNumber: rowNum, field: 'Nama_Lengkap', message: 'Nama lengkap minimal 3 karakter' });
        rowHasError = true;
      }

      // 4. Validate Jenjang Kelas (1 s/d 12)
      const gradeNum = Number(row.Jenjang_Kelas);
      if (isNaN(gradeNum) || gradeNum < 1 || gradeNum > 12) {
        errors.push({ rowNumber: rowNum, studentName: row.Nama_Lengkap, field: 'Jenjang_Kelas', message: 'Jenjang kelas harus angka 1 s/d 12' });
        rowHasError = true;
      }

      // 5. Validate WhatsApp
      const waStr = String(row.No_WhatsApp || '').replace(/[^0-9]/g, '');
      if (!waStr || waStr.length < 9) {
        errors.push({ rowNumber: rowNum, studentName: row.Nama_Lengkap, field: 'No_WhatsApp', message: 'Nomor WhatsApp wali tidak valid' });
        rowHasError = true;
      }

      // 6. Validate Status Jemputan
      const jemputanStr = String(row.Status_Jemputan || '').toUpperCase().trim();
      if (jemputanStr !== 'YA' && jemputanStr !== 'TIDAK') {
        errors.push({ rowNumber: rowNum, studentName: row.Nama_Lengkap, field: 'Status_Jemputan', message: 'Status jemputan harus YA atau TIDAK' });
        rowHasError = true;
      }

      if (!rowHasError) {
        seenNisnsInFile.add(nisnStr);
        seenNisInFile.add(nisStr);
        validRows.push({
          ...row,
          NISN: nisnStr,
          NIS: nisStr,
          Jenjang_Kelas: gradeNum,
          Status_Jemputan: jemputanStr as 'YA' | 'TIDAK',
        });
      }
    });

    return {
      totalRows: rows.length,
      validRowsCount: validRows.length,
      invalidRowsCount: errors.length,
      validRows,
      errors,
    };
  }

  /**
   * Generates sample template data structure for download
   */
  public static getTemplateSampleData(): ExcelStudentRow[] {
    return [
      {
        NISN: '0129845761',
        NIS: '20260101',
        Nama_Lengkap: 'Muhammad Rayyan Santoso',
        Jenjang_Kelas: 1,
        Nama_Wali: 'Ir. Budi Santoso',
        No_WhatsApp: '081298765432',
        Status_Jemputan: 'YA',
        ID_Rute_Jemputan: 'route-sd-1',
        Ekstrakurikuler_Diambil: 'ROBO, TAHFIDZ',
      },
      {
        NISN: '0105748923',
        NIS: '20230415',
        Nama_Lengkap: 'Aisyah Humaira Santoso',
        Jenjang_Kelas: 4,
        Nama_Wali: 'Ir. Budi Santoso',
        No_WhatsApp: '081298765432',
        Status_Jemputan: 'YA',
        ID_Rute_Jemputan: 'route-sd-1',
        Ekstrakurikuler_Diambil: 'TAHFIDZ',
      },
      {
        NISN: '0112334455',
        NIS: '20250209',
        Nama_Lengkap: 'Kenzo Alvaro Wijaya',
        Jenjang_Kelas: 2,
        Nama_Wali: 'H. Doni Wijaya',
        No_WhatsApp: '081122334455',
        Status_Jemputan: 'YA',
        ID_Rute_Jemputan: 'route-sd-2',
        Ekstrakurikuler_Diambil: 'FUTSAL',
      },
      {
        NISN: '0098776655',
        NIS: '20210602',
        Nama_Lengkap: 'Fathir Zaidan Al-Farisi',
        Jenjang_Kelas: 6,
        Nama_Wali: 'Dr. Hj. Rina Kartika',
        No_WhatsApp: '081344556677',
        Status_Jemputan: 'TIDAK',
        ID_Rute_Jemputan: '',
        Ekstrakurikuler_Diambil: 'ROBO, ENGLISH',
      },
    ];
  }
}
