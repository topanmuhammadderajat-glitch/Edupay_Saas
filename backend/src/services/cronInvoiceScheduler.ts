import type { PrismaClient } from '@prisma/client';
import { calculateStudentInvoice } from './billingCalculator.js';
import { HttpError } from '../http.js';

export class InvoiceSchedulerService {
  // Run from an authenticated scheduled job/manual route, never a timer in each HTTP instance.
  static async generateMonthlyInvoicesForSchool(db: PrismaClient, schoolId: string, month: number, year: number, actorId: string) {
    return db.$transaction(async tx => {
      const key = `billing:${schoolId}:${year}:${month}`;
      const result = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(hashtextextended(${key}, 0)) AS locked`;
      if (!result[0]?.locked) throw new HttpError(409, 'Pembuatan tagihan periode ini sedang berjalan');
      const school = await tx.school.findUniqueOrThrow({ where: { id: schoolId }, include: { grade_fees: true } });
      const students = await tx.student.findMany({
        where: { school_id: schoolId, is_active: true },
        include: { shuttle_route: true, extracurriculars: { include: { extracurricular: true } } },
      });
      const siblings = await tx.student.groupBy({
        by: ['parent_id'], where: { school_id: schoolId, is_active: true }, _count: { _all: true },
      });
      const siblingCounts = new Map(siblings.map(s => [s.parent_id, s._count._all]));
      let generated = 0;
      for (const student of students) {
        const exists = await tx.invoice.findUnique({
          where: { school_id_student_id_month_period_year_period: {
            school_id: schoolId, student_id: student.id, month_period: month, year_period: year,
          } }, select: { id: true },
        });
        if (exists) continue;
        const fee = school.grade_fees.find(f => f.grade === student.grade);
        if (!fee) throw new HttpError(409, `Tarif kelas ${student.grade} belum diatur`);
        const calc = calculateStudentInvoice({
          schoolId, studentId: student.id, grade: student.grade, monthPeriod: month, yearPeriod: year,
          gradeFee: { sppAmount: fee.spp_amount.toNumber(), registrationFee: fee.registration_fee.toNumber(),
            earlyBirdDiscount: fee.early_bird_discount.toNumber(), earlyBirdCutoffDay: fee.early_bird_cutoff_day,
            siblingDiscountPct: fee.sibling_discount_pct.toNumber() },
          shuttle: student.shuttle_route ? { type: student.shuttle_type,
            feeOneWay: student.shuttle_route.monthly_fee_one_way.toNumber(),
            feeTwoWay: student.shuttle_route.monthly_fee_two_way.toNumber(), zoneName: student.shuttle_route.zone_name } : null,
          extracurriculars: student.extracurriculars.filter(e => e.extracurricular.is_active).map(e => ({
            id: e.extracurricular.id, name: e.extracurricular.name, monthlyFee: e.extracurricular.monthly_fee.toNumber(),
          })),
          siblingCount: siblingCounts.get(student.parent_id) ?? 1, paymentDayOfMonth: 1, includeRegistrationFee: month === 7,
        });
        await tx.invoice.create({ data: {
          school_id: schoolId, student_id: student.id,
          invoice_no: `INV/${year}/${String(month).padStart(2, '0')}/${school.slug}-${student.nis}`,
          month_period: month, year_period: year,
          issue_date: new Date(`${year}-${String(month).padStart(2, '0')}-01T00:00:00+07:00`),
          due_date: new Date(`${year}-${String(month).padStart(2, '0')}-${String(Math.min(28, school.due_day_of_month)).padStart(2, '0')}T23:59:59+07:00`),
          spp_amount: calc.sppAmount, shuttle_amount: calc.shuttleAmount, extracurricular_amount: calc.extracurricularAmount,
          registration_amount: calc.registrationAmount, early_bird_discount: calc.earlyBirdDiscount,
          early_bird_cutoff_day: fee.early_bird_cutoff_day, sibling_discount: calc.siblingDiscount,
          total_amount: calc.totalAmount, items: { create: calc.breakdownItems.map(i => ({ ...i, school_id: schoolId })) },
        } });
        generated++;
      }
      await tx.auditEvent.create({ data: {
        school_id: schoolId, actor_id: actorId, action: 'MONTHLY_INVOICES_GENERATED', entity_id: key,
      } });
      return { generated, skipped: students.length - generated };
    }, { timeout: 120000, maxWait: 5000 });
  }
}
