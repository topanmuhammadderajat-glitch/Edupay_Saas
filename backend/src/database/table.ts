import { Prisma } from "@prisma/client";
export function databaseTable(name: "invoices" | "schools" | "students" | "onboarding_jobs") {
  const schema =
    new URL(process.env.DATABASE_URL!).searchParams.get("schema") ?? "public";
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema))
    throw new Error("Nama schema database tidak valid");
  return Prisma.raw('"' + schema + '"."' + name + '"');
}
