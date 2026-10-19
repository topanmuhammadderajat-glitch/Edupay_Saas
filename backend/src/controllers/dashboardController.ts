import { Prisma } from "@prisma/client";
import { databaseTable } from "../database/table.js";
import { invoicePriceSql } from "../services/billingCalculator.js";
import type { Request, Response } from "express";
import type { PrismaClient } from "@prisma/client";
import { invoiceScope } from "./invoiceController.js";
import { currentUser } from "../middleware/authMiddleware.js";
export class DashboardController {
  static async summary(req: Request, res: Response, db: PrismaClient) {
    const actor = currentUser(req),
      scope = invoiceScope(req);
    const day = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
    const start = new Date(day + "T00:00:00+07:00"),
      end = new Date(start.getTime() + 86400000);
    const [pending, paid, paidStudents, today] = await Promise.all([
      db.$queryRaw<
        { total: Prisma.Decimal | null; count: bigint }[]
      >`SELECT SUM(${invoicePriceSql()}) AS total, COUNT(*) AS count FROM ${databaseTable("invoices")} i JOIN ${databaseTable("students")} st ON st.id=i.student_id AND st.school_id=i.school_id WHERE i.school_id=${actor.school_id} AND i.status='PENDING' AND (${actor.role !== "PARENT"} OR st.parent_id=${actor.id})`,
      db.invoice.aggregate({
        where: { ...scope, status: "PAID" },
        _sum: { total_amount: true },
        _count: true,
      }),
      db.student.count({
        where: {
          school_id: actor.school_id,
          ...(actor.role === "PARENT" ? { parent_id: actor.id } : {}),
          invoices: { some: { status: "PAID" }, none: { status: "PENDING" } },
        },
      }),
      actor.role === "PARENT"
        ? Promise.resolve(null)
        : db.cashIncome.aggregate({
            where: {
              school_id: actor.school_id,
              date: { gte: start, lt: end },
            },
            _sum: { amount: true },
            _count: true,
          }),
    ]);
    res.json({
      success: true,
      data: {
        outstanding: pending[0].total ?? "0",
        pendingCount: Number(pending[0].count),
        paidAmount: paid._sum.total_amount ?? "0",
        paidCount: paid._count,
        paidStudents,
        todayIncome: today?._sum.amount ?? "0",
        todayCount: today?._count ?? 0,
        day,
      },
    });
  }
}
