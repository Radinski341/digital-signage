import { redirect } from "next/navigation";
import AdminShell from "@/components/admin/AdminShell";
import { requireAccess } from "@/server/access";
import { AppError } from "@/server/errors";
export const dynamic = "force-dynamic";
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let access;
  try {
    access = await requireAccess();
  } catch (error) {
    if (error instanceof AppError && error.status === 401)
      redirect("/admin/login");
    throw error;
  }
  return (
    <AdminShell
      siteName={access.site.name}
      role={access.role}
      email={access.user.email}
    >
      {children}
    </AdminShell>
  );
}
