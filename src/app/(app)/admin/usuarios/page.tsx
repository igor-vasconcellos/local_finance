import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { maskEmail } from "@/lib/mask";
import { listUsers } from "@/server/admin/service";
import { UsersView } from "./users-view";

export default async function AdminUsersPage({ searchParams }: PageProps<"/admin/usuarios">) {
  const q = (await searchParams).q;
  const search = typeof q === "string" ? q : "";
  const users = await listUsers(search);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="grid gap-4">
      <form role="search" className="flex gap-2" action="/admin/usuarios">
        <label htmlFor="q" className="sr-only">
          Buscar por nome ou e-mail
        </label>
        <Input id="q" name="q" defaultValue={search} placeholder="Buscar por nome ou e-mail completo" className="max-w-md" />
        <Button type="submit" variant="secondary">
          <Search aria-hidden /> Buscar
        </Button>
      </form>
      <UsersView
        today={today}
        search={search}
        users={users.map(({ email, ...u }) => ({ ...u, maskedEmail: maskEmail(email) }))}
      />
    </div>
  );
}
