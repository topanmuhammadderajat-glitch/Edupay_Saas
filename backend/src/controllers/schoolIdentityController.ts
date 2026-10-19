import type { Request, Response } from 'express';
import type { PrismaClient } from '@prisma/client';
import { currentUser } from '../middleware/authMiddleware.js';
import { HttpError } from '../http.js';
import { identitySelect,identityKinds,assetPath,validateIdentityImage,type IdentityKind } from '../services/schoolIdentityService.js';

export class SchoolIdentityController {
  static async branding(req:Request,res:Response,db:PrismaClient) {
    if (!/^[a-zA-Z0-9-]{1,100}$/.test(req.params.slug)) throw new HttpError(404,'Sekolah tidak ditemukan');
    const school=await db.school.findUnique({where:{slug:req.params.slug},select:{name:true,slug:true,logo_url:true,updated_at:true}});
    if (!school) throw new HttpError(404,'Sekolah tidak ditemukan');
    res.setHeader('Cache-Control','no-store');
    res.json({success:true,data:school});
  }
  static async profile(req:Request,res:Response,db:PrismaClient) {
    const school=await db.school.findUniqueOrThrow({where:{id:currentUser(req).school_id},select:identitySelect});
    res.json({success:true,data:school});
  }
  static async upload(req:Request,res:Response,db:PrismaClient) {
    const actor=currentUser(req),kind=req.params.kind as IdentityKind;
    if (!identityKinds.includes(kind)) throw new HttpError(400,'Jenis identitas tidak valid');
    if (!Buffer.isBuffer(req.body)) throw new HttpError(400,'Unggah berkas gambar PNG/JPEG');
    const contentType=req.get('content-type')?.split(';')[0].trim()??'';
    await validateIdentityImage(req.body,contentType);
    const school=await db.$transaction(async tx=>{
      const asset=await tx.schoolAsset.upsert({
        where:{school_id_kind:{school_id:actor.school_id,kind}},
        create:{school_id:actor.school_id,kind,data:req.body,content_type:contentType},
        update:{data:req.body,content_type:contentType},
        select:{id:true},
      });
      const result=await tx.school.update({where:{id:actor.school_id},data:{[kind+'_url']:assetPath(asset.id,kind)},select:identitySelect});
      await tx.auditEvent.create({data:{school_id:actor.school_id,actor_id:actor.id,action:'SCHOOL_IDENTITY_'+kind.toUpperCase()+'_UPDATED',entity_id:asset.id}});
      return result;
    });
    res.json({success:true,data:school});
  }
  static async publicLogo(req:Request,res:Response,db:PrismaClient) {
    const asset=await db.schoolAsset.findUnique({where:{id:req.params.assetId},include:{school:{select:{logo_url:true}}}});
    if (!asset || asset.kind!=='logo' || asset.school.logo_url!==assetPath(asset.id,'logo')) throw new HttpError(404,'Logo tidak ditemukan');
    this.send(res,asset);
  }
  static async privateAsset(req:Request,res:Response,db:PrismaClient) {
    const asset=await db.schoolAsset.findFirst({where:{id:req.params.assetId,school_id:currentUser(req).school_id}});
    if (!asset) throw new HttpError(404,'Gambar tidak ditemukan');
    this.send(res,asset);
  }
  private static send(res:Response,asset:{data:Buffer;content_type:string}) {
    res.setHeader('Cache-Control','private, no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Content-Security-Policy',"default-src 'none'; sandbox");
    res.type(asset.content_type).send(asset.data);
  }
}
