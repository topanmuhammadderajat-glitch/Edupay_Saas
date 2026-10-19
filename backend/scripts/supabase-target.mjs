import {createHash} from 'node:crypto';
export function supabaseTarget(env) {
  const read=key=>{
    let url;try{url=new URL(env[key]);}catch{throw new Error(key+' belum tersedia atau bukan URL PostgreSQL yang valid');}
    if(!['postgresql:','postgres:'].includes(url.protocol))throw new Error(key+' harus PostgreSQL cloud');
    if(!url.password || /PASSWORD_DB|REPLACE_ME|YOUR_|\[|\]|<|>/i.test(decodeURIComponent(url.password)))throw new Error(key+' masih berupa template');
    if(!['require','verify-ca','verify-full'].includes(url.searchParams.get('sslmode')))throw new Error(key+' wajib menggunakan TLS (sslmode=require/verify-full)');
    const direct=/^db\.([a-z0-9]+)\.supabase\.co$/.exec(url.hostname);
    const pooled=/\.pooler\.supabase\.com$/.test(url.hostname)?decodeURIComponent(url.username).split('.').at(-1):null;
    const project=direct?.[1]??pooled;
    if(!project||!/^[a-z0-9]+$/.test(project))throw new Error(key+' belum menunjuk Supabase resmi; target lain tidak akan ditulis');
    return {url,project};
  };
  const runtime=read('DATABASE_URL'),direct=read('DIRECT_URL');
  if(runtime.project!==direct.project || runtime.url.pathname!==direct.url.pathname ||
     (runtime.url.searchParams.get('schema')??'public')!==(direct.url.searchParams.get('schema')??'public'))
    throw new Error('DATABASE_URL dan DIRECT_URL harus menunjuk proyek, database, dan schema Supabase yang sama');
  if((direct.url.searchParams.get('schema')??'public')!=='public')throw new Error('Seed awal membutuhkan schema public');
  return {runtimeUrl:runtime.url.href,directUrl:direct.url.href,project:runtime.project,
    fingerprint:createHash('sha256').update(runtime.project+runtime.url.pathname).digest('hex').slice(0,16)};
}
