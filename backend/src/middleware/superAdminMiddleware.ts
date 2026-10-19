import type { RequestHandler } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import {randomUUID} from 'node:crypto';
import {HttpError} from '../http.js';
const audience='edupay-onboarding';
let keyCache:{key:string;hash:string}|undefined;
function config(){
 let hash=process.env.SUPERADMIN_PASSCODE_HASH;const secret=process.env.SUPERADMIN_SESSION_SECRET,key=process.env.SUPERADMIN_MASTER_KEY;
 if(!hash&&key){if(keyCache?.key!==key)keyCache={key,hash:bcrypt.hashSync(key,12)};hash=keyCache.hash;}
 if(!hash||!secret||secret.length<32||/REPLACE_|YOUR_/i.test(secret)||(!process.env.SUPERADMIN_PASSCODE_HASH&&/REPLACE_|YOUR_/i.test(key??'')))throw new HttpError(503,'Gerbang Super Admin belum dikonfigurasi di server');
 return {hash,secret};
}
export async function createSuperAdminSession(passcode:string){
 const {hash,secret}=config();
 if(!await bcrypt.compare(passcode,hash))throw new HttpError(401,'Passcode tidak sesuai');
 return jwt.sign({scope:'onboard-school'},secret,{algorithm:'HS256',subject:'platform-onboarding',audience,issuer:'edupay-backend',expiresIn:'15m',jwtid:randomUUID()});
}
export const requireSuperAdmin:RequestHandler=(req,_res,next)=>{
 try{
  const {secret}=config(),token=/^Bearer ([^\s]+)$/.exec(req.get('authorization')??'')?.[1];
  if(!token)throw new HttpError(401,'Sesi Super Admin diperlukan');
  let payload;try{payload=jwt.verify(token,secret,{algorithms:['HS256'],audience,issuer:'edupay-backend'});}catch{throw new HttpError(401,'Sesi Super Admin berakhir. Masukkan passcode kembali.')}
  if(typeof payload==='string'||payload.scope!=='onboard-school'||payload.sub!=='platform-onboarding')throw new HttpError(403,'Akses onboarding ditolak');
  next();
 }catch(e){next(e)}
};
