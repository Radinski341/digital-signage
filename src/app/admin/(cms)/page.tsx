import Link from "next/link";
import { db } from "@/server/db";
import { requireAccess } from "@/server/access";
import { PageHeader } from "@/components/admin/PageHeader";
export default async function Dashboard() {
  const { siteId, site } = await requireAccess();
  const [
    published,
    drafts,
    active,
    unavailable,
    banners,
    slides,
    locations,
    branding,
    recent,
  ] = await Promise.all([
    db.page.count({ where: { siteId, status: "PUBLISHED" } }),
    db.page.count({ where: { siteId, status: "DRAFT" } }),
    db.menuItem.count({
      where: { siteId, status: "PUBLISHED", available: true },
    }),
    db.menuItem.count({
      where: { siteId, status: "PUBLISHED", available: false },
    }),
    db.banner.count({ where: { siteId } }),
    db.slide.count({ where: { siteId } }),
    db.location.count({ where: { siteId } }),
    db.branding.findUnique({ where: { siteId } }),
    db.auditLog.findMany({
      where: { siteId },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        action: true,
        createdAt: true,
        actor: { select: { email: true } },
      },
    }),
  ]);
  const setup = [
    {
      label: "Restaurant currency & time zone",
      done: Boolean(site.currency && site.timeZone),
      href: "/admin/profile",
    },
    {
      label: "Address & opening hours",
      done: locations > 0,
      href: "/admin/locations",
    },
    {
      label: "Brand logo",
      done: Boolean(branding?.logoId),
      href: "/admin/branding",
    },
    { label: "Published menu dishes", done: active > 0, href: "/admin/menu" },
    {
      label: "Published website pages",
      done: published > 0,
      href: "/admin/pages",
    },
    {
      label: "Public website origin",
      done: Boolean(site.domain),
      href: "/admin/profile",
    },
  ];
  return (
    <>
      <PageHeader
        title="Your restaurant, at a glance"
        description="Keep the website and in-store displays current from one workspace."
      />
      <div className="dashboard-stats">
        {[
          ["Published pages", published],
          ["Draft pages", drafts],
          ["Available dishes", active],
          ["Unavailable dishes", unavailable],
          ["Banners", banners],
          ["Slides", slides],
        ].map(([label, value]) => (
          <div className="dashboard-stat" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <section className="dashboard-section">
        <h2>Quick actions</h2>
        <div className="quick-actions">
          {[
            ["Manage menu", "/admin/menu"],
            ["Edit homepage", "/admin/pages"],
            ["Upload images", "/admin/media"],
            ["Create banner", "/admin/banners"],
            ["Create slide", "/admin/slides"],
            ["Opening hours", "/admin/locations"],
          ].map(([label, href]) => (
            <Link key={href} href={href}>
              {label} <span>↗</span>
            </Link>
          ))}
        </div>
      </section>
      <div className="dashboard-columns">
        <section className="dashboard-section">
          <h2>Website setup</h2>
          <p>
            {setup.filter((s) => s.done).length} of {setup.length} essentials
            configured
          </p>
          <ul className="setup-checklist">
            {setup.map((s) => (
              <li key={s.href}>
                <span aria-label={s.done ? "Complete" : "Incomplete"}>
                  {s.done ? "✓" : "○"}
                </span>
                <Link href={s.href}>{s.label}</Link>
              </li>
            ))}
          </ul>
        </section>
        <section className="dashboard-section">
          <h2>Recent activity</h2>
          {recent.length ? (
            <ul className="activity-list">
              {recent.map((a) => (
                <li key={a.id}>
                  <strong>{a.action.replaceAll(".", " · ")}</strong>
                  <small>
                    {a.actor?.email || "Operator"} ·{" "}
                    {a.createdAt.toLocaleString()}
                  </small>
                </li>
              ))}
            </ul>
          ) : (
            <p>Saved changes and publications will appear here.</p>
          )}
        </section>
      </div>
    </>
  );
}
