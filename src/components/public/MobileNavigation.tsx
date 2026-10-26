"use client";
import { useState } from "react";
import { Menu } from "lucide-react";
import { PublicDialog } from "./PublicDialog";
export default function MobileNavigation({
  links,
  label,
  closeLabel,
}: {
  links: Array<{ href: string; label: string }>;
  label: string;
  closeLabel: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mobile-navigation">
      <button
        className="public-icon-button"
        aria-expanded={open}
        aria-label={label}
        onClick={() => {
          setOpen(true);
        }}
      >
        <Menu size={24} />
      </button>
      <PublicDialog
        open={open}
        onOpenChange={setOpen}
        title={label}
        closeLabel={closeLabel}
        className="mobile-public-menu"
      >
        <nav aria-label={label}>
          {links.map((link, index) => (
            <a
              key={`${link.href}-${index}`}
              href={link.href}
              onClick={() => setOpen(false)}
            >
              {link.label}
            </a>
          ))}
        </nav>
      </PublicDialog>
    </div>
  );
}
