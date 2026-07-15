import { redirect } from "next/navigation";
import { getDb } from "../../db";
import { employees } from "../../db/schema";
import SetupForm from "./setup-form";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const existing = await getDb().select({ id: employees.id }).from(employees).limit(1);
  if (existing.length) redirect("/login");
  return <SetupForm />;
}
