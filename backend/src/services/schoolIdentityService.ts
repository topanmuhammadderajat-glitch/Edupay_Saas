import type { PrismaClient } from '@prisma/client';
import { PDFDocument } from 'pdf-lib';
import { HttpError } from '../http.js';

export const identitySelect = { id:true, name:true, slug:true, updated_at:true, logo_url:true, stamp_url:true, signature_url:true } as const;
export const identityKinds = ['logo','stamp','signature'] as const;
export type IdentityKind = typeof identityKinds[number];
export type IdentityImage = { bytes: Uint8Array; contentType: string };
export const assetPath = (id:string,kind?:string) => '/api/v1/'+(kind==='logo'?'school-logos/':'school-assets/') + id;

export async function validateIdentityImage(bytes:Buffer, contentType:string) {
  if (!bytes.length || bytes.length > 1024*1024) throw new HttpError(400,'Ukuran gambar maksimal 1 MB');
  const png = bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const jpeg = bytes[0]===255 && bytes[1]===216 && bytes[2]===255;
  if (!(png && contentType==='image/png') && !(jpeg && contentType==='image/jpeg'))
    throw new HttpError(400,'Gunakan berkas PNG atau JPEG yang valid');
  if (png && (bytes.length<24 || bytes.readUInt32BE(16)>2048 || bytes.readUInt32BE(20)>2048))
    throw new HttpError(400,'Dimensi gambar maksimal 2048 × 2048 piksel');
  try {
    const doc=await PDFDocument.create();
    const img=png?await doc.embedPng(bytes):await doc.embedJpg(bytes);
    if (!img.width || !img.height || img.width>2048 || img.height>2048) throw new Error('dimensions');
    // Force decoding now, so a corrupt image cannot break later PDF generation.
    await doc.save();
  } catch { throw new HttpError(400,'Gambar rusak atau dimensinya melebihi 2048 × 2048 piksel'); }
}
export async function loadSchoolIdentity(db:PrismaClient, school:{id:string;logo_url:string|null;stamp_url:string|null;signature_url:string|null}) {
  const rows=await db.schoolAsset.findMany({where:{school_id:school.id}});
  const image=(kind:IdentityKind):IdentityImage|undefined=>{
    const row=rows.find(r=>r.kind===kind && assetPath(r.id,kind)===school[(kind+'_url') as 'logo_url'|'stamp_url'|'signature_url']);
    return row?{bytes:row.data,contentType:row.content_type}:undefined;
  };
  return {logo:image('logo'),stamp:image('stamp'),signature:image('signature')};
}
