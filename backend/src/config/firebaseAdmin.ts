import {applicationDefault,cert,getApps,initializeApp,type ServiceAccount} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {HttpError} from '../http.js';

export function parseServiceAccount(raw:string,expectedProject?:string):ServiceAccount{
 let value;try{value=JSON.parse(raw)}catch{throw new HttpError(503,'FIREBASE_SERVICE_ACCOUNT_JSON bukan JSON yang valid')}
 if(value.type!=='service_account'||typeof value.project_id!=='string'||typeof value.client_email!=='string'||typeof value.private_key!=='string')
  throw new HttpError(503,'Firebase membutuhkan JSON service_account Admin SDK yang lengkap');
 if(expectedProject&&value.project_id!==expectedProject)throw new HttpError(503,'Proyek service account Firebase tidak sesuai GOOGLE_CLOUD_PROJECT');
 const key=value.private_key.replace(/\\n/g,'\n');
 if(!key.includes('-----BEGIN PRIVATE KEY-----'))throw new HttpError(503,'Private key Firebase tidak valid');
 return {projectId:value.project_id,clientEmail:value.client_email,privateKey:key};
}
export function firebaseApp(){
 const existing=getApps()[0];if(existing)return existing;
 const raw=process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
 if(process.env.NODE_ENV==='production'&&!raw&&!process.env.GOOGLE_APPLICATION_CREDENTIALS)
  throw new HttpError(503,'Siapkan FIREBASE_SERVICE_ACCOUNT_JSON atau secret file Firebase Admin di hosting');
 return initializeApp({projectId:process.env.GOOGLE_CLOUD_PROJECT,
  credential:raw?cert(parseServiceAccount(raw,process.env.GOOGLE_CLOUD_PROJECT)):applicationDefault()});
}
export function firebaseAuth(){return getAuth(firebaseApp())}
