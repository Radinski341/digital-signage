import {
  AlertCircle,
  Bean,
  Egg,
  Fish,
  Leaf,
  Milk,
  Nut,
  Shell,
  Shrimp,
  Wheat,
} from "lucide-react";
import { dishText } from "@/modules/menu-items";
import type { PublicContent } from "@/server/public";
const allergenIcons: Record<string, typeof Wheat> = {
  gluten: Wheat,
  wheat: Wheat,
  cereals: Wheat,
  milk: Milk,
  dairy: Milk,
  eggs: Egg,
  egg: Egg,
  fish: Fish,
  shellfish: Shell,
  molluscs: Shell,
  crustaceans: Shrimp,
  peanuts: Nut,
  nuts: Nut,
  soy: Bean,
  soybeans: Bean,
  celery: Leaf,
  mustard: Leaf,
  sesame: Leaf,
  lupin: Bean,
};
export default function AllergenPanel({
  tags,
  site,
  locale,
  strings,
}: {
  tags: any[];
  site: PublicContent;
  locale: string;
  strings: Record<string, string>;
}) {
  return (
    <section className="dish-allergen-panel">
      <div className="dish-allergen-heading">
        <AlertCircle size={22} aria-hidden="true" />
        <h2>{strings.allergens}</h2>
      </div>
      {tags.length ? (
        <>
          <p className="dish-allergen-intro">{strings.declaredAllergens}</p>
          <ul className="dish-allergen-list">
            {tags.map(({ tag }) => {
              const text = dishText(tag, locale, site.defaultLocale);
              const Icon = allergenIcons[tag.key?.toLowerCase()] || AlertCircle;
              return (
                <li key={tag.id}>
                  <span className="dish-allergen-icon">
                    <Icon size={23} aria-hidden="true" />
                  </span>
                  <span>
                    <small>{strings.contains}</small>
                    <strong lang={text?.locale}>{text?.name}</strong>
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="dish-allergen-note">{strings.allergenAdvice}</p>
        </>
      ) : (
        <>
          <p className="dish-allergen-intro">{strings.allergensUnconfirmed}</p>
          <p className="dish-allergen-note">{strings.allergenAdvice}</p>
        </>
      )}
    </section>
  );
}
