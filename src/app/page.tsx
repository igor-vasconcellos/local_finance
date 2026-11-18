import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/server/auth/current";
import { hasMasterUser } from "@/server/auth/users";

/** Porta de entrada: decide para onde mandar o usuário. */
export default async function Home() {
  await connection(); // depende do banco a cada acesso — nunca gerar estático na build
  if (!hasMasterUser()) redirect("/setup");
  if (await getCurrentSession()) redirect("/dashboard");
  redirect("/login");
}
