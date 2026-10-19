import {Router} from 'express';
import {rateLimit} from 'express-rate-limit';
import {z} from 'zod';
import type {PrismaClient} from '@prisma/client';
import {createSuperAdminSession,requireSuperAdmin} from '../middleware/superAdminMiddleware.js';
import {AdminOnboardingController} from '../controllers/adminOnboardingController.js';
import {route} from '../http.js';
export function createAdminRouter(db:PrismaClient,auth?:Parameters<typeof AdminOnboardingController.onboard>[3]){
 const router=Router();
 router.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');next()});
 router.post('/session',rateLimit({windowMs:15*60000,limit:10,standardHeaders:'draft-7',legacyHeaders:false}),route(async(req,res)=>{
  const {passcode}=z.object({passcode:z.string().min(1).max(128)}).strict().parse(req.body);
  res.json({success:true,data:{token:await createSuperAdminSession(passcode),expiresIn:900}});
 }));
 router.post('/onboard-school',requireSuperAdmin,rateLimit({windowMs:60000,limit:10}),route((req,res)=>AdminOnboardingController.onboard(req,res,db,auth)));
 return router;
}
