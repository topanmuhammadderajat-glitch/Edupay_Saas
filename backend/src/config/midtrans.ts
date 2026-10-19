import { HttpError } from '../http.js';
import midtransClient from 'midtrans-client';
import type { School } from '@prisma/client';
type Credentials = Pick<School, 'midtrans_server_key' | 'midtrans_client_key' | 'midtrans_is_prod'>;
// No credential cache: rotations take effect on the next request.
export function getTenantSnapClient(school: Credentials) {
  const snap = new midtransClient.Snap({
    isProduction: school.midtrans_is_prod,
    serverKey: school.midtrans_server_key, clientKey: school.midtrans_client_key,
  });
  snap.httpClient.http_client.defaults.timeout=15000;
  if (process.env.PUBLIC_API_URL?.startsWith("https://")) {
    snap.httpClient.http_client.defaults.headers.common["X-Override-Notification"] = new URL("/api/v1/webhooks/midtrans", process.env.PUBLIC_API_URL).href;
  }
  return snap;
}
export async function getGatewayStatus(school: Credentials, orderId: string) {
  const api = new midtransClient.CoreApi({
    isProduction: school.midtrans_is_prod,
    serverKey: school.midtrans_server_key, clientKey: school.midtrans_client_key,
  });
  api.httpClient.http_client.defaults.timeout=15000;
  return api.transaction.status(orderId);
}

export function getGatewayCallbacks(){
  if(!process.env.PUBLIC_FRONTEND_URL)return undefined;
  let url:URL;try{url=new URL(process.env.PUBLIC_FRONTEND_URL)}catch{throw new HttpError(503,'Alamat portal pembayaran belum valid')}
  if(!['http:','https:'].includes(url.protocol)||(process.env.NODE_ENV==='production'&&url.protocol!=='https:'))throw new HttpError(503,'Alamat portal pembayaran harus HTTPS untuk produksi');
  return {finish:url.href};
}
