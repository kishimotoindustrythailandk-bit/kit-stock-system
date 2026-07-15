import { redirect } from "next/navigation";
import { getEmployeeUser } from "../employee-auth";
import LoginForm from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams?: Promise<{ returnTo?: string }> }) {
  const user = await getEmployeeUser();
  if (user) redirect("/");
  const params = searchParams ? await searchParams : {};
  return <LoginForm returnTo={params.returnTo || "/"} />;
}
