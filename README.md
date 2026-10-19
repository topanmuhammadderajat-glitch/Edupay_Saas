# EduPay SaaS

Public deployment source for the multi-school Express payment backend.

- Backend: Node.js / TypeScript / Prisma
- Database: existing Supabase PostgreSQL
- Authentication: Firebase Admin SDK
- Hosting blueprint: Render Free (render.yaml)
- Liveness endpoint: GET /api/health
- Readiness endpoint: GET /health/ready

Runtime credentials are supplied as hosting secrets. Do not commit .env files, service-account keys, runtime data or test accounts.
