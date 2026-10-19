import type { IdentityImage } from './schoolIdentityService.js';
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import QRCode from "qrcode";

export type ReceiptDocument = {
  schoolId?: string;
  logo?: IdentityImage;
  stamp?: IdentityImage;
  signature?: IdentityImage;
  schoolName: string;
  receiptNo: string;
  invoiceNo: string;
  studentName: string;
  nis: string;
  amount: string;
  channel: string;
  paidAt: Date;
  verificationUrl: string;
  status?: string;
  treasurerName?: string;
};
export async function generateReceiptPdf(data: ReceiptDocument) {
  const doc = await PDFDocument.create(),
    font = await doc.embedFont(StandardFonts.Helvetica),
    bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([595.28, 841.89]);
  const green = rgb(0.025, 0.306, 0.231),
    muted = rgb(0.39, 0.48, 0.43),
    line = rgb(0.83, 0.9, 0.86);
  const safe = (v: string) =>
    [...v]
      .map((c) => {
        try {
          font.encodeText(c);
          return c;
        } catch {
          return "?";
        }
      })
      .join("");
  const write = (
    v: string,
    x: number,
    y: number,
    size = 11,
    strong = false,
    maxWidth = 480,
  ) => {
    const f = strong ? bold : font;
    let text = safe(v);
    while (f.widthOfTextAtSize(text, size) > maxWidth && text.length > 1)
      text = text.slice(0, -2) + "…";
    page.drawText(text, { x, y, size, font: f, color: strong ? green : muted });
  };
  const paid = data.status === undefined || data.status === "PAID";
  page.drawRectangle({
    x: 30,
    y: 30,
    width: 535.28,
    height: 781.89,
    borderWidth: 1,
    borderColor: line,
  });
  page.drawRectangle({
    x: 37,
    y: 37,
    width: 521.28,
    height: 767.89,
    borderWidth: 0.4,
    borderColor: line,
  });
  page.drawRectangle({
    x: 38,
    y: 725,
    width: 519,
    height: 78,
    color: rgb(0.95, 0.985, 0.96),
  });
  write("EDUPAY / E-SCHOOL MUMTAZ", 55, 779, 9, true);
  write(data.schoolName, 55, 752, 16, true, 410);
  write(paid ? "KUITANSI PEMBAYARAN" : "DOKUMEN TAGIHAN", 55, 692, 19, true);
  write(
    paid
      ? "LUNAS"
      : data.status === "PENDING"
        ? "BELUM LUNAS"
        : data.status === "EXPIRED"
          ? "KEDALUWARSA"
          : "DIBATALKAN",
    55,
    668,
    10,
    true,
  );
  const embed = (image:IdentityImage) => image.contentType==='image/png' ? doc.embedPng(image.bytes) : doc.embedJpg(image.bytes);
  if (data.logo) {
    const logo=await embed(data.logo),d=logo.scaleToFit(48,48);
    page.drawImage(logo,{x:490,y:746,width:d.width,height:d.height});
  }
  const rows = [
    ["Nomor kuitansi", data.receiptNo],
    ["Nomor tagihan", data.invoiceNo],
    ["Nama siswa", data.studentName],
    ["NIS", data.nis],
    ["Kanal pembayaran", data.channel],
    [
      paid ? "Waktu pembayaran (WIB)" : "Jatuh tempo (WIB)",
      data.paidAt.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }),
    ],
  ];
  rows.forEach(([label, value], i) => {
    const y = 627 - i * 37;
    write(label, 55, y, 10);
    write(value, 224, y, 11, true, 310);
    page.drawLine({
      start: { x: 55, y: y - 14 },
      end: { x: 540, y: y - 14 },
      thickness: 0.4,
      color: line,
    });
  });
  page.drawRectangle({
    x: 55,
    y: 350,
    width: 485,
    height: 47,
    color: rgb(0.94, 0.98, 0.95),
  });
  write(paid ? "TOTAL PEMBAYARAN" : "TOTAL TAGIHAN", 68, 368, 10, true);
  write(
    "Rp " +
      Number(data.amount).toLocaleString("id-ID", { minimumFractionDigits: 2 }),
    292,
    366,
    19,
    true,
    235,
  );
  if (paid && data.verificationUrl) {
    const qr = await doc.embedPng(
      await QRCode.toBuffer(data.verificationUrl, { width: 180, margin: 1 }),
    );
    page.drawImage(qr, { x: 55, y: 183, width: 120, height: 120 });
    write("Pindai QR untuk verifikasi", 55, 167, 9);
    write("nomor kuitansi pada server.", 55, 154, 9);
    write("Petugas Keuangan", 353, 302, 11, true, 180);
    const signature=Boolean(data.signature),stamp=Boolean(data.stamp);
    for (const [image,x,y,width,height] of [
      [data.stamp,398,202,105,90],
      [data.signature,337,211,150,72],
    ] as const) {
      if (!image) continue;
      const img=await embed(image),d=img.scaleToFit(width,height);
      page.drawImage(img,{x,y,width:d.width,height:d.height});
    }
    if (!signature && !stamp) write(data.schoolName,326,236,9,false,210);
    write(
      data.treasurerName && data.treasurerName !== "Belum dikonfigurasi"
        ? data.treasurerName
        : "Bagian Keuangan Sekolah",
      325,
      184,
      11,
      true,
      210,
    );
    if (!signature || !stamp)
      write("Tanda tangan / cap belum dibubuhkan.", 325, 166, 8, false, 210);
    write(
      "Verifikasi QR membuktikan catatan pembayaran di server.",
      55,
      105,
      9,
    );
  } else
    write(
      "Dokumen ini bukan bukti pelunasan. Bayar melalui kanal resmi sekolah.",
      55,
      270,
      10,
    );
  write(
    "Nomor unik per sekolah dan periode. Simpan dokumen ini untuk administrasi.",
    55,
    80,
    8,
  );
  doc.setTitle((paid ? "Kuitansi " : "Tagihan ") + data.invoiceNo);
  doc.setProducer("EduPay / E-School Mumtaz");
  return Buffer.from(await doc.save());
}
