import Link from "next/link";
import { ArrowUpRight, Utensils } from "lucide-react";
import { formatPrice, localize } from "@/modules/formatting";

export default function MenuItemCard({
  item,
  image,
  locale,
  defaultLocale,
  strings,
  priority = false,
  first = false,
}: {
  item: any;
  image?: any;
  locale: string;
  defaultLocale: string;
  strings: Record<string, string>;
  priority?: boolean;
  first?: boolean;
}) {
  const text = localize(item.translations, locale, defaultLocale) as any;
  return (
    <article className={`menu-dish ${item.available ? "" : "unavailable"}`}>
      <Link
        className="dish-photograph"
        href={item.detailHref}
        prefetch={false}
        aria-label={`${strings.viewDetails}: ${text?.name}`}
      >
        {image ? (
          <img
            src={image.url}
            srcSet={
              image.thumbnailUrl
                ? `${image.thumbnailUrl} 480w, ${image.url} ${Math.max(image.width || 960, 481)}w`
                : undefined
            }
            sizes="(min-width: 1400px) 370px, (min-width: 1000px) 25vw, (min-width: 700px) 33vw, 50vw"
            width={image.width || 640}
            height={image.height || 640}
            alt={image.alt || text?.name || ""}
            loading={priority ? "eager" : "lazy"}
            fetchPriority={first ? "high" : undefined}
          />
        ) : (
          <span className="dish-image-placeholder">
            <Utensils size={36} aria-hidden="true" />
          </span>
        )}
        <span className="dish-plus" aria-hidden="true">
          <ArrowUpRight size={23} strokeWidth={1.5} />
        </span>
      </Link>
      <div className="dish-copy">
        <span className="dish-price">
          {formatPrice(item.price, item.currency, locale)}
        </span>
        <h3 lang={text?.locale}>
          <Link href={item.detailHref} prefetch={false}>
            {text?.name}
          </Link>
        </h3>
        {text?.description && <p lang={text.locale}>{text.description}</p>}
        {!item.available && (
          <strong className="availability">{strings.unavailable}</strong>
        )}
      </div>
    </article>
  );
}
