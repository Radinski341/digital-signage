"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, ReactNode } from "react";
import { signOut } from "next-auth/react";
import {
  LayoutDashboard,
  Globe,
  Utensils,
  Image,
  Monitor,
  Settings,
  Menu,
  X,
  LogOut,
  ArrowUpRight,
} from "lucide-react";
import { Toaster } from "sonner";
const groups = [
  {
    name: "Overview",
    icon: LayoutDashboard,
    links: [
      ["Dashboard", "/admin"],
      ["Website Assistant", "/admin/ai-builder"],
    ],
  },
  {
    name: "Website",
    icon: Globe,
    links: [
      ["Pages", "/admin/pages"],
      ["Navigation", "/admin/navigation"],
    ],
  },
  {
    name: "Restaurant",
    icon: Utensils,
    links: [
      ["Menu", "/admin/menu"],
      ["Categories", "/admin/categories"],
      ["Dietary & allergens", "/admin/tags"],
      ["Restaurant information", "/admin/profile"],
      ["Locations & opening hours", "/admin/locations"],
    ],
  },
  {
    name: "Content",
    icon: Image,
    links: [
      ["Media library", "/admin/media"],
      ["Buttons & actions", "/admin/actions"],
    ],
  },
  {
    name: "Digital signage",
    icon: Monitor,
    links: [
      ["Banners", "/admin/banners"],
      ["Slides", "/admin/slides"],
      ["Templates", "/admin/templates"],
    ],
  },
  {
    name: "Settings",
    icon: Settings,
    links: [
      ["Branding", "/admin/branding"],
      ["Languages", "/admin/locales"],
      ["Integrations", "/admin/integrations"],
      ["Users & permissions", "/admin/users"],
      ["My password", "/admin/password"],
    ],
  },
];
export default function AdminShell({
  siteName,
  role,
  email,
  children,
}: {
  siteName: string;
  role: string;
  email: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
  const sidebar = useRef<HTMLElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 800px)");
    const update = () => setMobile(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!mobile || !open) return;
    const previous =
      (document.activeElement as HTMLElement | null) ?? toggle.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () =>
      Array.from(
        sidebar.current?.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),[tabindex="0"]',
        ) ?? [],
      ).filter((element) => element.offsetParent !== null);
    (focusable()[0] ?? sidebar.current)?.focus({ preventScroll: true });
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const elements = focusable(),
        first = elements[0],
        last = elements.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !sidebar.current?.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      document.body.style.overflow = previousOverflow;
      previous?.focus({ preventScroll: true });
    };
  }, [mobile, open]);

  return (
    <div className="admin-shell">
      <a className="skip-link" href="#admin-main">
        Skip to content
      </a>
      <header className="admin-mobile-header">
        <button
          ref={toggle}
          aria-label="Open navigation"
          aria-controls="admin-sidebar"
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          <Menu />
        </button>
        <strong>{siteName}</strong>
      </header>
      {open && (
        <button
          className="admin-nav-overlay"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        ref={sidebar}
        id="admin-sidebar"
        tabIndex={-1}
        role={mobile ? "dialog" : undefined}
        aria-modal={mobile && open ? true : undefined}
        aria-label={mobile ? "Restaurant navigation" : undefined}
        aria-hidden={mobile && !open ? true : undefined}
        inert={mobile && !open ? true : undefined}
        className={`admin-sidebar ${open ? "open" : ""}`}
      >
        <div className="admin-brand">
          <div className="brand-mark">
            <Utensils size={22} />
          </div>
          <div>
            <strong>{siteName}</strong>
            <small>Restaurant workspace</small>
          </div>
          <button
            className="mobile-close"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
          >
            <X />
          </button>
        </div>
        <nav aria-label="Administration">
          {groups.map((group) => {
            const Icon = group.icon;
            const links = group.links
              .filter(
                ([name]) => name !== "Users & permissions" || role === "OWNER",
              )
              .filter(
                ([, href]) =>
                  role !== "EDITOR" ||
                  ![
                    "/admin/branding",
                    "/admin/locales",
                    "/admin/integrations",
                    "/admin/profile",
                  ].includes(href),
              );
            return (
              <div className="admin-nav-group" key={group.name}>
                <span>
                  <Icon size={14} />
                  {group.name}
                </span>
                {links.map(([name, href]) => (
                  <Link
                    key={href}
                    href={href}
                    aria-current={pathname === href ? "page" : undefined}
                    onClick={() => setOpen(false)}
                  >
                    {name}
                  </Link>
                ))}
              </div>
            );
          })}
        </nav>
        <div className="admin-account">
          <small>{email}</small>
          <span>{role.charAt(0) + role.slice(1).toLowerCase()}</span>
          <a href="/" target="_blank" rel="noopener noreferrer">
            View website <ArrowUpRight size={14} />
          </a>
          <button onClick={() => signOut({ callbackUrl: "/admin/login" })}>
            <LogOut size={14} />
            Sign out
          </button>
        </div>
      </aside>
      <div
        className="admin-workspace"
        inert={mobile && open ? true : undefined}
      >
        <div className="admin-topbar">
          <span>Restaurant platform</span>
          <a href="/" target="_blank" rel="noopener noreferrer">
            Open website ↗
          </a>
        </div>
        <main id="admin-main" className="admin-main">
          {children}
        </main>
      </div>
      <Toaster richColors position="bottom-right" />
    </div>
  );
}
