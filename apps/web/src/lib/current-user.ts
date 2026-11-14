import { cookies } from "next/headers";
import { COOKIE_NAME, resolveSession } from "@/lib/auth-db";

export async function currentUser() {
  const jar = await cookies();
  return resolveSession(jar.get(COOKIE_NAME)?.value);
}
