import { redirect } from "next/navigation";
import { requireAccess } from "@/server/access";
import { db as prisma } from "@/server/db";
import Link from "next/link";

export const revalidate = 0;

export default async function BannerIndex() {
  let access;
  try {
    access = await requireAccess();
  } catch {
    redirect("/admin/login");
  }
  const { siteId } = access;
  const banners = await prisma.banner.findMany({
    where: { siteId },
    include: { template: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="container">
      <h1>Banners</h1>
      <table className="table">
        <thead>
          <tr>
            <th>Template</th>
            <th>ID</th>
            <th>Preview</th>
          </tr>
        </thead>
        <tbody>
          {banners.map((b) => (
            <tr key={b.id}>
              <td>{b.template.name}</td>
              <td>
                <code>{b.id}</code>
              </td>
              <td>
                <Link href={`/banner/${b.id}`}>Open Fullscreen</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const metadata = { robots: { index: false, follow: false } };
