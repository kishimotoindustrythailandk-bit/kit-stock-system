import { redirect } from "next/navigation";
import { requireEmployee } from "../employee-auth";
import EmployeeManager from "./employee-manager";

export const dynamic = "force-dynamic";

export default async function EmployeesPage() {
  const user = await requireEmployee("/employees");
  if (user.role !== "admin") redirect("/");
  return <EmployeeManager currentUser={user} />;
}
