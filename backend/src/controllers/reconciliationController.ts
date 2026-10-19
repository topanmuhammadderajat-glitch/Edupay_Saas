import type { Request, Response } from "express";
import type { PrismaClient } from "@prisma/client";
import { invoiceScope } from "./invoiceController.js";
import { synchronizeAttempt } from "./webhookController.js";
import { HttpError } from "../http.js";
export class ReconciliationController {
  static async reconcile(req: Request, res: Response, db: PrismaClient) {
    const invoice = await db.invoice.findFirst({
      where: { ...invoiceScope(req), id: req.params.invoiceId },
      select: { id: true, status: true, school_id: true },
    });
    if (!invoice) throw new HttpError(404, "Tagihan tidak ditemukan");
    if (invoice.status === "PENDING") {
      const attempts = await db.paymentAttempt.findMany({
        where: {
          school_id: invoice.school_id,
          invoice_id: invoice.id,
          status: { in: ["CREATING", "READY", "REVIEW"] },
        },
        include: { invoice: { include: { school: true } } },
        orderBy: { created_at: "desc" },
        take: 5,
      });
      for (const attempt of attempts) await synchronizeAttempt(db, attempt);
    }
    const latest = await db.invoice.findUniqueOrThrow({
      where: { school_id_id: { school_id: invoice.school_id, id: invoice.id } },
      select: { status: true, paid_at: true },
    });
    res.json({ success: true, data: latest });
  }
}
