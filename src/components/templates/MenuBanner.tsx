import { formatPrice } from "@/modules/formatting";
type Props = { data: any };

export default function MenuBanner({ data }: Props) {
  const {
    description,
    title,
    firstListTitle,
    firstList,
    secondListTitle,
    secondList,
    thirdListTitle,
    thirdList,
  } = data || {};

  const renderMenuItems = (items: any[]) => {
    if (!Array.isArray(items)) return null;

    return items.map((item, index) => (
      <div key={index} className="menu-item">
        <div className="item-name">{item.name}</div>
        <div className="item-price">
          {data.__currency
            ? formatPrice(
                String(item.price),
                data.__currency,
                data.__locale || "en",
              )
            : String(item.price)}
        </div>
      </div>
    ));
  };

  return (
    <div data-template="menu" className="tpl full">
      <div className="overlay" />
      <div className="content">
        <div className="header">
          {description && <div className="restaurant-name">{description}</div>}
          {title && <h1 className="menu-title">{title}</h1>}
        </div>

        <div className="menu-grid">
          <div className="menu-section">
            {firstListTitle && (
              <div className="section-title">{firstListTitle}</div>
            )}
            <div className="menu-items">{renderMenuItems(firstList)}</div>
          </div>

          <div className="menu-section">
            {secondListTitle && (
              <div className="section-title">{secondListTitle}</div>
            )}
            <div className="menu-items">{renderMenuItems(secondList)}</div>
          </div>

          <div className="menu-section">
            {thirdListTitle && (
              <div className="section-title">{thirdListTitle}</div>
            )}
            <div className="menu-items">{renderMenuItems(thirdList)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
