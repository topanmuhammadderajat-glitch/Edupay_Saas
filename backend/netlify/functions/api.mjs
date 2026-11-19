import serverless from 'serverless-http';
let cachedHandler;
export async function handler(event,context){
 process.env.EDUPAY_SERVERLESS='1';
 cachedHandler??=import('../../dist/server.js').then(({default:app})=>serverless(app,{binary:['application/pdf','image/png','image/jpeg']}));
 if(context)context.callbackWaitsForEmptyEventLoop=false;
 return (await cachedHandler)(event,context);
}
