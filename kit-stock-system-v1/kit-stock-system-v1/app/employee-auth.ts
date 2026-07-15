import { and, eq, gt } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "../db";
import { employees, employeeSessions } from "../db/schema";

export type EmployeeRole = "admin" | "sender" | "inspector" | "receiver" | "viewer";

export type EmployeeUser = {
  id: number;
  employeeCode: string;
  fullName: string;
  role: EmployeeRole;
  mustChangePin: boolean;
};

export const SESSION_COOKIE = "kit_employee_session";
export const SESSION_SECONDS = 12 * 60 * 60;

export async function getEmployeeUser(): Promise<EmployeeUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const sessionHash = await sha256(token);
  const db = getDb();
  const [row] = await db
    .select({
      id: employees.id,
      employeeCode: employees.employeeCode,
      fullName: employees.fullName,
      role: employees.role,
      active: employees.active,
      mustChangePin: employees.mustChangePin,
    })
    .from(employeeSessions)
    .innerJoin(employees, eq(employeeSessions.employeeId, employees.id))
    .where(and(
      eq(employeeSessions.sessionHash, sessionHash),
      gt(employeeSessions.expiresAt, new Date().toISOString()),
    ))
    .limit(1);

  if (!row?.active) return null;
  return {
    id: row.id,
    employeeCode: row.employeeCode,
    fullName: row.fullName,
    role: row.role as EmployeeRole,
    mustChangePin: row.mustChangePin,
  };
}

export async function requireEmployee(returnTo = "/"): Promise<EmployeeUser> {
  const user = await getEmployeeUser();
  if (user) return user;
  redirect(`/login?returnTo=${encodeURIComponent(safeReturnTo(returnTo))}`);
}

export function hasRole(user: EmployeeUser, allowed: EmployeeRole[]) {
  return user.role === "admin" || allowed.includes(user.role);
}

export async function hashPin(pin: string, saltHex?: string) {
  const salt = saltHex ? hexToBytes(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: 160_000 },
    key,
    256,
  );
  return { hash: bytesToHex(new Uint8Array(bits)), salt: bytesToHex(salt) };
}

export async function verifyPin(pin: string, expectedHash: string, salt: string) {
  const calculated = await hashPin(pin, salt);
  return constantTimeEqual(calculated.hash, expectedHash);
}

export function createSessionToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return bytesToBase64Url(bytes);
}

export async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

function safeReturnTo(value: string) {
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(value: string) {
  if (!/^[0-9a-f]+$/i.test(value) || value.length % 2) throw new Error("Invalid salt");
  return new Uint8Array(value.match(/.{2}/g)!.map((byte) => Number.parseInt(byte, 16)));
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}
