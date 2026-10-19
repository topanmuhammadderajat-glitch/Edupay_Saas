import type { Request, Response } from "express";
import { createHash, timingSafeEqual } from "node:crypto";
import { Prisma, type PaymentChannel, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { getGatewayStatus } from "../config/midtrans.js";
import { HttpError } from "../http.js";
import { lockInvoice, recordPayment } from "../services/paymentService.js";

const notificationSchema = z.object({
  order_id: z.string().uuid(),
  status_code: z.string().regex(/^\d{3}$/),
  gross_amount: z.string().regex(/^\d{1,10}(\.\d{1,2})?$/),
  signature_key: z.string().regex(/^[a-fA-F0-9]{128}$/),
});
export function validSignature(
  payload: z.infer<typeof notificationSchema>,
  key: string,
) {
  const expected = createHash("sha512")
    .update(payload.order_id + payload.status_code + payload.gross_amount + key)
    .digest();
  const actual = Buffer.from(payload.signature_key, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function gatewayChannel(status: {
  payment_type?: string;
  va_numbers?: { bank: string }[];
  bank?: string;
}): PaymentChannel {
  if (["qris", "gopay", "shopeepay"].includes(status.payment_type ?? ""))
    return "QRIS";
  const bank = status.va_numbers?.[0]?.bank ?? status.bank;
  if (bank === "bca") return "BCA_VA";
  if (bank === "bni") return "BNI_VA";
  if (bank === "bri") return "BRI_VA";
  if (status.payment_type === "echannel" || bank === "mandiri")
    return "MANDIRI_VA";
  throw new HttpError(409, "Kanal gateway tidak didukung; perlu rekonsiliasi");
}
const gatewaySchema = z.object({
  order_id: z.string(),
  gross_amount: z.string().regex(/^\d{1,10}(\.\d{1,2})?$/),
  transaction_status: z.string(),
  fraud_status: z.string().optional(),
  payment_type: z.string().optional(),
  bank: z.string().optional(),
  va_numbers: z.array(z.object({ bank: z.string() })).optional(),
});
export class WebhookController {
  static async handleMidtransNotification(
    req: Request,
    res: Response,
    db: PrismaClient,
    getStatus = getGatewayStatus,
  ) {
    if (
      typeof req.body?.signature_key !== "string" ||
      !/^[a-fA-F0-9]{128}$/.test(req.body.signature_key)
    )
      throw new HttpError(403, "Signature wajib dan harus valid");
    const payload = notificationSchema.parse(req.body);
    const attempt = await db.paymentAttempt.findUnique({
      where: { order_id: payload.order_id },
      include: { invoice: { include: { school: true } } },
    });
    if (!attempt) throw new HttpError(404, "Order tidak ditemukan");
    if (!attempt.invoice.school.midtrans_server_key)
      throw new HttpError(503, "Merchant sekolah belum dikonfigurasi");
    if (!validSignature(payload, attempt.invoice.school.midtrans_server_key))
      throw new HttpError(403, "Signature tidak valid");
    if (!new Prisma.Decimal(payload.gross_amount).equals(attempt.amount))
      throw new HttpError(400, "Nominal notifikasi tidak cocok");
    await synchronizeAttempt(db, attempt, getStatus);
    res.json({ success: true, status: "OK" });
  }
}

export async function synchronizeAttempt(
  db: PrismaClient,
  attempt: Prisma.PaymentAttemptGetPayload<{
    include: { invoice: { include: { school: true } } };
  }>,
  getStatus = getGatewayStatus,
) {
  if (!attempt.invoice.school.midtrans_server_key)
    throw new HttpError(409, "Merchant sekolah belum dikonfigurasi");
  // transaction_status is not covered by Midtrans's signature. Fetch the authoritative status.
  let raw: unknown;
  try {
    raw = await getStatus(attempt.invoice.school, attempt.order_id);
  } catch {
    throw new HttpError(503, "Status gateway belum dapat diverifikasi");
  }
  const status = gatewaySchema.parse(raw);
  if (
    status.order_id !== attempt.order_id ||
    !new Prisma.Decimal(status.gross_amount).equals(attempt.amount)
  )
    throw new HttpError(400, "Order atau nominal gateway tidak cocok");

  await db.$transaction(async (tx) => {
    const invoice = await lockInvoice(
      tx,
      attempt.school_id,
      attempt.invoice_id,
    );
    const current = await tx.paymentAttempt.findUniqueOrThrow({
      where: { school_id_id: { school_id: attempt.school_id, id: attempt.id } },
    });
    if (!invoice.total_amount.equals(current.amount))
      throw new HttpError(409, "Nominal invoice berubah");
    const reversal = [
      "refund",
      "partial_refund",
      "chargeback",
      "partial_chargeback",
    ].includes(status.transaction_status);
    if (current.status === "SETTLED" && !reversal) return;
    const paid =
      status.transaction_status === "settlement" ||
      (status.transaction_status === "capture" &&
        status.fraud_status === "accept");
    if (paid) {
      const previous = await tx.paymentTransaction.findUnique({
        where: {
          school_id_invoice_id: {
            school_id: invoice.school_id,
            invoice_id: invoice.id,
          },
        },
      });
      if (invoice.status !== "PENDING" || previous) {
        if (previous?.midtrans_order_id === current.order_id) return;
        if (
          current.status !== "REVIEW" ||
          current.gateway_status !== status.transaction_status
        ) {
          await tx.paymentAttempt.update({
            where: { id: current.id },
            data: {
              status: "REVIEW",
              gateway_status: status.transaction_status,
            },
          });
          await tx.auditEvent.create({
            data: {
              school_id: invoice.school_id,
              actor_id: "MIDTRANS",
              action: "PAYMENT_REQUIRES_REFUND_REVIEW",
              entity_id: current.id,
            },
          });
        }
        return;
      }
      const channel = gatewayChannel(status);
      await recordPayment(tx, {
        schoolId: invoice.school_id,
        invoiceId: invoice.id,
        amount: current.amount,
        channel,
        actorId: "MIDTRANS",
        orderId: current.order_id,
        gatewayStatus: status.transaction_status,
      });
      await tx.paymentAttempt.update({
        where: { id: current.id },
        data: { status: "SETTLED", gateway_status: status.transaction_status },
      });
    } else if (
      ["cancel", "deny", "expire"].includes(status.transaction_status)
    ) {
      // Only the attempt expires. Invoice PAID is never downgraded.
      if (
        current.status === "REVIEW" &&
        ["settlement", "capture"].includes(current.gateway_status ?? "")
      )
        return;
      const next =
        status.transaction_status === "expire" ? "EXPIRED" : "CANCELLED";
      if (current.status !== next) {
        await tx.paymentAttempt.update({
          where: { id: current.id },
          data: { status: next, gateway_status: status.transaction_status },
        });
        await tx.auditEvent.create({
          data: {
            school_id: invoice.school_id,
            actor_id: "MIDTRANS",
            action: `ATTEMPT_${next}`,
            entity_id: current.id,
          },
        });
      }
    } else if (
      reversal &&
      current.gateway_status !== status.transaction_status
    ) {
      await tx.paymentAttempt.update({
        where: { id: current.id },
        data: { status: "REVIEW", gateway_status: status.transaction_status },
      });
      await tx.auditEvent.create({
        data: {
          school_id: invoice.school_id,
          actor_id: "MIDTRANS",
          action: "GATEWAY_REVERSAL_REVIEW",
          entity_id: current.id,
        },
      });
    }
  });
}
