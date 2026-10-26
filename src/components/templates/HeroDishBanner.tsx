import { formatPrice } from "@/modules/formatting";
type Props = { data: any };
export default function HeroDishBanner({ data }: Props) {
  const { image, title, subtitle, description, price, themeColor } = data || {};
  return (
    <div data-template="hero-dish" className="tpl full">
      {image && <img className="bg" src={image} alt={title || "hero"} />}
      <div className="overlay" />
      <div className="content">
        {subtitle && <div className="subtitle">{subtitle}</div>}
        {title && <h1 className="title">{title}</h1>}
        {description && (
          <div
            className="desc"
            dangerouslySetInnerHTML={{ __html: String(description) }}
          />
        )}
      </div>
      {price != null && (
        <div className="price" style={{ borderColor: themeColor || "#f59e0b" }}>
          {data.__currency
            ? formatPrice(String(price), data.__currency, data.__locale || "en")
            : String(price)}
        </div>
      )}
    </div>
  );
}
