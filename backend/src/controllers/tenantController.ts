import { databaseTable } from '../database/table.js';
import type { Request, Response } from 'express';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { currentUser } from '../middleware/authMiddleware.js';
import { schoolSelect, studentInclude } from '../dto.js';
import { HttpError } from '../http.js';

const rupiah = z.number().int().min(0).max(9999999999);
const fees = z.object({ gradeFees: z.array(z.object({
  grade: z.number().int().min(1).max(12), spp_amount: rupiah, registration_fee: rupiah,
  early_bird_discount: rupiah, early_bird_cutoff_day: z.number().int().min(1).max(28),
  sibling_discount_pct: z.number().min(0).max(100),
}).strict()).min(1).max(12) }).strict();
export class TenantController {
  static async getAllSchools(req: Request, res: Response, db: PrismaClient) {
    res.json({ success: true, data: await db.school.findMany({
      where: { id: currentUser(req).school_id }, select: schoolSelect,
    }) });
  }
  static async getSchoolDetails(req: Request, res: Response, db: PrismaClient) {
    const school = await db.school.findUnique({ where: { id: currentUser(req).school_id }, select: {
      ...schoolSelect, midtrans_server_key: true, profile: {select:{bank_name:true,bank_account_number:true,bank_account_holder:true}}, grade_fees: { orderBy: { grade: 'asc' } },
    } });
    if (!school) throw new HttpError(404, 'Sekolah tidak ditemukan');
    const { midtrans_server_key, ...safe } = school;
    res.json({ success: true, data: { ...safe, online_payments_available: Boolean(midtrans_server_key) } });
  }
  static async updateGradeFees(req: Request, res: Response, db: PrismaClient) {
    const actor = currentUser(req);
    const input = fees.parse(req.body);
    if (new Set(input.gradeFees.map(f => f.grade)).size !== input.gradeFees.length)
      throw new HttpError(400, 'Kelas duplikat');
    await db.$transaction(async tx => {
      for (const fee of input.gradeFees) {
        await tx.gradeFeeSetting.upsert({
          where: { school_id_grade: { school_id: actor.school_id, grade: fee.grade } },
          create: { school_id: actor.school_id, ...fee }, update: fee,
        });
      }
      await tx.auditEvent.create({ data: {
        school_id: actor.school_id, actor_id: actor.id, action: 'GRADE_FEES_UPDATED', entity_id: actor.school_id,
      } });
    });
    res.json({ success: true });
  }
  static async updateMidtransConfig(req: Request, res: Response, db: PrismaClient) {
    const actor = currentUser(req);
    const input = z.object({
      serverKey: z.string().trim().min(10).max(255), clientKey: z.string().trim().min(10).max(255), isProd: z.boolean(),
    }).strict().parse(req.body);
    const school = await db.$transaction(async tx => {
      // Serialize against attempt creation before rotating merchant credentials.
      await tx.$queryRaw`SELECT id FROM ${databaseTable('schools')} WHERE id = ${actor.school_id} FOR UPDATE`;
      const active = await tx.paymentAttempt.count({ where: {
        school_id: actor.school_id, status: { in: ['CREATING', 'READY', 'REVIEW'] },
      } });
      if (active) throw new HttpError(409, 'Selesaikan seluruh order aktif sebelum mengganti kredensial');
      const safe = await tx.school.update({
        where: { id: actor.school_id }, data: {
          midtrans_server_key: input.serverKey, midtrans_client_key: input.clientKey, midtrans_is_prod: input.isProd,
        }, select: schoolSelect,
      });
      await tx.auditEvent.create({ data: {
        school_id: actor.school_id, actor_id: actor.id, action: 'MIDTRANS_CONFIG_UPDATED', entity_id: actor.school_id,
      } });
      return safe;
    });
    res.json({ success: true, data: school });
  }
  static async getChildren(req: Request, res: Response, db: PrismaClient) {
    const actor = currentUser(req);
    if (actor.role === 'PARENT' && req.params.parentId !== actor.id) throw new HttpError(403, 'Akses wali ditolak');
    const children = await db.student.findMany({
      where: { school_id: actor.school_id, parent_id: req.params.parentId, is_active: true },
      include: studentInclude, orderBy: { id: 'asc' }, take: 100,
    });
    res.json({ success: true, data: children });
  }
}
