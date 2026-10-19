import {HttpError} from '../http.js';
export function configurePublicHosting(env:NodeJS.ProcessEnv){
 if(!env.PUBLIC_API_URL&&env.RENDER_EXTERNAL_URL)env.PUBLIC_API_URL=env.RENDER_EXTERNAL_URL;
 if(env.NODE_ENV==='production'){
  for(const key of ['PUBLIC_API_URL','PUBLIC_FRONTEND_URL','ONBOARDING_FRONTEND_URL']){
   if(!env[key])throw new HttpError(503,key+' diperlukan untuk hosting produksi');
   let url;try{url=new URL(env[key]!)}catch{throw new HttpError(503,key+' harus berupa URL HTTPS')}
   if(url.protocol!=='https:'||url.username||url.password||['localhost','127.0.0.1','[::1]'].includes(url.hostname))
    throw new HttpError(503,key+' harus menggunakan HTTPS publik tanpa kredensial');
  }
 }
 const origins=new Set([...(env.CORS_ORIGINS??'').split(',').map(s=>s.trim()).filter(Boolean),'https://edupay-saas.web.app']);
 return [...origins].map(origin=>{
  let u;try{u=new URL(origin)}catch{throw new HttpError(503,'CORS_ORIGINS harus berisi daftar origin yang valid')}
  if(u.origin!==origin||!['http:','https:'].includes(u.protocol)||(env.NODE_ENV==='production'&&u.protocol!=='https:'))throw new HttpError(503,'Origin CORS tidak valid');
  return origin;
 });
}
