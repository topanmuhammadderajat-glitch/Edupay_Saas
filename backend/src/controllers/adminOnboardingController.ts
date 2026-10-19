import type {Request,Response} from 'express';
import {randomUUID,createHmac} from 'node:crypto';
import {firebaseAuth} from '../config/firebaseAdmin.js';
import {getAuth,type CreateRequest} from 'firebase-admin/auth';
import type {PrismaClient} from '@prisma/client';
import {z} from 'zod';
import {HttpError} from '../http.js';
import {databaseTable} from '../database/table.js';
export const onboardingInput=z.object({
 requestId:z.string().uuid(),
 schoolName:z.string().trim().min(3).max(160),
 slug:z.string().min(3).max(60).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
 phone:z.string().trim().min(7).max(30).regex(/^[+0-9() .-]+$/),
 address:z.string().trim().min(10).max(500),
 staffName:z.string().trim().min(3).max(120),
 adminEmail:z.string().trim().email().max(200).transform(v=>v.toLowerCase()),
 temporaryPassword:z.string().min(12).max(72).refine(v=>/[a-z]/.test(v)&&/[A-Z]/.test(v)&&/[0-9]/.test(v)&&/[^a-zA-Z0-9]/.test(v)),
}).strict();
type ProvisionAuth=Pick<ReturnType<typeof getAuth>,'createUser'|'getUser'|'deleteUser'>;
export class AdminOnboardingController{
 static async onboard(req:Request,res:Response,db:PrismaClient,auth:ProvisionAuth=firebaseAuth()){
  const input=onboardingInput.parse(req.body),{requestId,...details}=input;
  const secret=process.env.SUPERADMIN_SESSION_SECRET;
  if(!secret)throw new HttpError(503,'Konfigurasi onboarding belum tersedia');
  const fingerprint=createHmac('sha256',secret).update(JSON.stringify(details)).digest('hex');
  let where={id:requestId};
  let job=await db.onboardingJob.findUnique({where});
  if(!job){job=await db.onboardingJob.findFirst({where:{slug:input.slug,admin_email:input.adminEmail,fingerprint}});if(job)where={id:job.id};}
  if(!job){
   if(await db.school.findUnique({where:{slug:input.slug},select:{id:true}}))throw new HttpError(409,'Kode sekolah sudah digunakan');
   try{job=await db.onboardingJob.create({data:{id:requestId,slug:input.slug,admin_email:input.adminEmail,fingerprint,school_id:randomUUID(),firebase_uid:'onboard_'+requestId}})}
   catch(e){if((e as {code?:string}).code!=='P2002')throw e;job=await db.onboardingJob.findUnique({where});if(!job)throw new HttpError(409,'Kode sekolah atau email sedang digunakan untuk onboarding lain')}
  }
  if(job.fingerprint!==fingerprint)throw new HttpError(409,'Permintaan ini sudah dipakai dengan data berbeda. Mulai pendaftaran baru.');
  let result:{school:{id:string;name:string;slug:string};replayed:boolean};
  try{result=await db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM ${databaseTable('onboarding_jobs')} WHERE id=${where.id} FOR UPDATE`;
   const current=await tx.onboardingJob.findUniqueOrThrow({where});
   if(current.status==='COMPLETED'){
    const school=await tx.school.findUniqueOrThrow({where:{id:current.school_id},select:{id:true,name:true,slug:true}});
    return {school,replayed:true};
   }
   let created=false;
   try{
    let identity;
    try{identity=await auth.getUser(current.firebase_uid)}catch(e){if((e as {code?:string}).code!=='auth/user-not-found')throw e}
    if(identity&&(identity.email!==input.adminEmail||identity.disabled))throw new HttpError(409,'Identitas akun onboarding tidak sesuai. Hubungi operator.');
    if(!identity){
     try{await auth.createUser({uid:current.firebase_uid,email:input.adminEmail,password:input.temporaryPassword,displayName:input.staffName,emailVerified:false} as CreateRequest);created=true}
     catch(e){if((e as {code?:string}).code==='auth/email-already-exists')throw new HttpError(409,'Email sudah terdaftar di Firebase. Gunakan email admin lain.');throw e}
    }
    const school=await tx.school.create({data:{
     id:current.school_id,name:input.schoolName,slug:input.slug,npsn:'ONBOARD-'+current.school_id,phone:input.phone,address:input.address,
     midtrans_server_key:'',midtrans_client_key:'',midtrans_is_prod:false,
     profile:{create:{kop_surat_title:input.schoolName,kop_surat_subtitle:'',kop_surat_address:input.address,kop_surat_contact:input.phone,
      headmaster_name:'Belum dikonfigurasi',treasurer_name:input.staffName,bank_name:'',bank_account_number:'',bank_account_holder:''}},
    },select:{id:true,name:true,slug:true}});
    const user=await tx.user.create({data:{school_id:school.id,firebase_uid:current.firebase_uid,email:input.adminEmail,role:'ADMIN_TU',full_name:input.staffName}});
    await tx.expenseCategory.createMany({data:[['OPR','Operasional Sekolah'],['GAJI','Gaji dan Honorarium'],['SARPRAS','Sarana dan Prasarana']].map(([code,name])=>({school_id:school.id,code,name}))});
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit'}).formatToParts(new Date());
    const period=parts.find(p=>p.type==='year')!.value+parts.find(p=>p.type==='month')!.value;
    await tx.receiptSequence.create({data:{school_id:school.id,period,value:0}});
    await tx.auditEvent.create({data:{school_id:school.id,actor_id:'platform-onboarding',action:'SCHOOL_ONBOARDED',entity_id:user.id}});
    await tx.onboardingJob.update({where,data:{status:'COMPLETED'}});
    return {school,replayed:false};
   }catch(e){
    if(created){try{await auth.deleteUser(current.firebase_uid)}catch{console.error('ONBOARDING_CLEANUP_PENDING',{requestId});}}
    throw e;
   }
  },{maxWait:10000,timeout:45000});}catch(e){
   if(e instanceof HttpError&&e.message==='Email sudah terdaftar di Firebase. Gunakan email admin lain.')await db.onboardingJob.deleteMany({where:{id:where.id,status:'PENDING'}});
   throw e;
  }
  const origin=new URL(process.env.ONBOARDING_FRONTEND_URL??'https://edupay-saas.web.app');
  if(!['http:','https:'].includes(origin.protocol))throw new HttpError(503,'URL portal sekolah belum valid');
  origin.pathname='/';origin.search='';origin.searchParams.set('school',result.school.slug);
  res.setHeader('Cache-Control','no-store');
  res.status(result.replayed?200:201).json({success:true,data:{...result.school,adminEmail:input.adminEmail,staffName:input.staffName,role:'ADMIN_TU',loginUrl:origin.href,replayed:result.replayed}});
 }
}
