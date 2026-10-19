import type { Request, RequestHandler } from 'express';
import type { PrismaClient, UserRole } from '@prisma/client';
import {firebaseAuth} from '../config/firebaseAdmin.js';
import { HttpError } from '../http.js';

export type AuthUser = { id: string; school_id: string; role: UserRole; full_name: string };
declare global { namespace Express { interface Request { auth?: AuthUser } } }

export async function verifyFirebaseToken(token: string) {
  if (process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new HttpError(503, 'Autentikasi emulator tidak diizinkan');
  return firebaseAuth().verifyIdToken(token, true);
}
export function authMiddleware(db: PrismaClient, verify: (token: string) => Promise<{ uid: string }> = verifyFirebaseToken): RequestHandler {
  return async (req, _res, next) => {
    try {
      const match = /^Bearer ([^\s]+)$/.exec(req.get('authorization') ?? '');
      if (!match) throw new HttpError(401, 'Token autentikasi wajib dikirim');
      let uid: string;
      try { uid = (await verify(match[1])).uid; }
      catch { throw new HttpError(401, 'Token tidak valid atau telah dicabut'); }
      const user = await db.user.findUnique({
        where: { firebase_uid: uid },
        select: { id: true, school_id: true, role: true, full_name: true, is_active: true },
      });
      if (!user?.is_active) throw new HttpError(403, 'Pengguna tidak aktif atau belum terdaftar');
      if (user.role !== 'KASIR' && user.role !== 'ADMIN_TU' && user.role !== 'PARENT') throw new HttpError(403, 'Aplikasi pembayaran hanya mengizinkan Keuangan/Kasir dan Wali Murid');
      req.auth = { id: user.id, school_id: user.school_id, role: user.role, full_name: user.full_name };
      next();
    } catch (error) { next(error); }
  };
}
export function currentUser(req: Request): AuthUser {
  if (!req.auth) throw new HttpError(401, 'Autentikasi diperlukan');
  return req.auth;
}
export const tenantScope: RequestHandler = (req, _res, next) => {
  try {
    if (req.params.schoolId !== currentUser(req).school_id) throw new HttpError(403, 'Akses sekolah ditolak');
    // SUPERADMIN also remains scoped to its assigned school on school routes.
    next();
  } catch (error) { next(error); }
};
export function requireRoles(...roles: UserRole[]): RequestHandler {
  return (req, _res, next) => {
    try {
      if (!roles.includes(currentUser(req).role)) throw new HttpError(403, 'Hak akses tidak mencukupi');
      next();
    } catch (error) { next(error); }
  };
}
