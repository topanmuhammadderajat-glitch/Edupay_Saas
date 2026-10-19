/** @param {Record<string, string | undefined>} env */
export function assertCloudConfiguration(env) {
  const missing = ['DATABASE_URL', 'GOOGLE_CLOUD_PROJECT'].filter(key => !env[key]);
  if(env.NODE_ENV==='production'&&!env.FIREBASE_SERVICE_ACCOUNT_JSON&&!env.GOOGLE_APPLICATION_CREDENTIALS)missing.push('FIREBASE_SERVICE_ACCOUNT_JSON atau GOOGLE_APPLICATION_CREDENTIALS');
  if (missing.length) throw new Error('Konfigurasi belum tersedia: ' + missing.join(', ') + '. Isi backend/.env.');
  if (env.FIREBASE_AUTH_EMULATOR_HOST || env.FIRESTORE_EMULATOR_HOST)
    throw new Error('Emulator Firebase tidak diizinkan untuk evaluasi cloud.');
  if (/YOUR_CLOUD_HOST|REPLACE_ME|CHANGE_ME/i.test(env.DATABASE_URL))
    throw new Error('PostgreSQL cloud belum terhubung: konfigurasi masih template SSL.');
  let url;
  try { url = new URL(env.DATABASE_URL); } catch { throw new Error('DATABASE_URL tidak valid'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('Database wajib PostgreSQL cloud.');
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const socket = url.searchParams.get('host');
  const cloudSocket = socket?.startsWith('/cloudsql/') && socket.split('/').length === 3;
  if (!cloudSocket && (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') ||
    host === '::1' || host === '0.0.0.0' || host === '::' || host.startsWith('127.') || host.startsWith('::ffff:127.')))
    throw new Error('Database lokal/loopback tidak diizinkan. Gunakan host PostgreSQL cloud.');
  if (!cloudSocket && !['require', 'verify-ca', 'verify-full'].includes(url.searchParams.get('sslmode')))
    throw new Error('DATABASE_URL cloud harus menggunakan sslmode=require atau verify-full.');
  if (url.searchParams.get('sslaccept') === 'accept_invalid_certs') throw new Error('Sertifikat TLS tidak boleh diabaikan.');
  if (env.NODE_TLS_REJECT_UNAUTHORIZED === '0') throw new Error('Verifikasi sertifikat TLS harus aktif.');
  return { transport: cloudSocket ? 'cloud-sql-socket' : 'postgresql-tls' };
}
