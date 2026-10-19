import 'dotenv/config';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {supabaseTarget} from './supabase-target.mjs';

// Migration credentials must be explicit; never reuse an owner file from an old database.
export function migrationUrl(env,requireSupabase=false) {
 if(requireSupabase)return supabaseTarget(env).directUrl;
 const url=env.MIGRATION_DATABASE_URL??env.DIRECT_URL??env.DATABASE_URL;
 if(!url)throw new Error('Koneksi migrasi belum tersedia');
 return url;
}
if(process.argv[1]&&fs.realpathSync(process.argv[1])===fs.realpathSync(fileURLToPath(import.meta.url))){
 try{
  const url=migrationUrl(process.env,process.argv.includes('--supabase'));
  const env={...process.env,DATABASE_URL:url};
  if(process.platform==='win32')env.PRISMA_SCHEMA_ENGINE_BINARY=fs.realpathSync('node_modules/@prisma/engines/schema-engine-windows.exe');
  const result=spawnSync(process.execPath,['node_modules/prisma/build/index.js','migrate','deploy'],{stdio:'inherit',env});
  process.exitCode=result.status??1;
 }catch(e){console.error('Migrasi belum dijalankan:',e.message);process.exitCode=1}
}
