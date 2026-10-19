import type { RequestHandler, ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export const route = (handler: RequestHandler): RequestHandler => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};
export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof HttpError) res.status(error.status).json({ success: false, message: error.message });
  else if (error?.type === 'entity.too.large') res.status(413).json({success:false,message:'Ukuran gambar maksimal 1 MB'});
  else if (error instanceof ZodError || error?.type === 'entity.parse.failed')
    res.status(400).json({ success: false, message: 'Input tidak valid' });
  else {
    console.error('Request failed', { code: error?.code ?? 'INTERNAL' });
    res.status(500).json({ success: false, message: 'Permintaan gagal diproses. Silakan coba kembali.' });
  }
};
