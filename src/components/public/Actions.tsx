import { Phone, MapPin, ShoppingBag, ArrowUpRight } from "lucide-react";
import { actionLink, localized, PublicContent } from "@/server/public";
export default function Actions({
  ids,
  site,
  locale,
}: {
  ids: string[];
  site: PublicContent;
  locale: string;
}) {
  return (
    <div className="public-actions">
      {ids.map((id) => {
        const action = site.actions.find((a) => a.id === id);
        const href = actionLink(action, site, locale);
        const text = localized(action?.translations ?? [], locale, site) as any;
        const Icon = (
          {
            phone: Phone,
            map: MapPin,
            order: ShoppingBag,
            arrow: ArrowUpRight,
          } as any
        )[action?.icon];
        return href && text ? (
          <a
            key={id}
            className={`public-button ${action.style}`}
            href={href}
            target={action.newTab ? "_blank" : undefined}
            rel={action.newTab ? "noopener noreferrer" : undefined}
          >
            {Icon && <Icon aria-hidden="true" size={16} />}
            {text.label}
          </a>
        ) : null;
      })}
    </div>
  );
}
