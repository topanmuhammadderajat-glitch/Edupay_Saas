import type { PrismaClient } from "@prisma/client";
import { synchronizeAttempt } from "../controllers/webhookController.js";
export function startReconciliationWorker(db: PrismaClient) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout>;
  async function tick() {
    try {
      const attempts = await db.paymentAttempt.findMany({
        where: {
          status: { in: ["CREATING", "READY", "REVIEW"] },
          updated_at: { lt: new Date(Date.now() - 60000) },
          invoice: { school: { midtrans_server_key: { not: "" } } },
        },
        include: { invoice: { include: { school: true } } },
        orderBy: { updated_at: "asc" },
        take: 10,
      });
      for (const attempt of attempts) {
        if (stopped) break;
        // Replicas may check the same order; the shared row lock makes settlement idempotent.
        try {
          await synchronizeAttempt(db, attempt);
        } catch {
          console.error("Rekonsiliasi akan dicoba ulang: " + attempt.id);
        } finally {
          await db.paymentAttempt.updateMany({
            where: { id: attempt.id, school_id: attempt.school_id },
            data: { updated_at: new Date() },
          });
        }
      }
    } catch {
      console.error("Worker rekonsiliasi menunggu koneksi database.");
    }
    if (!stopped) {
      timer = setTimeout(() => void tick(), 60000);
      timer.unref();
    }
  }
  timer = setTimeout(() => void tick(), 10000);
  timer.unref();
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
