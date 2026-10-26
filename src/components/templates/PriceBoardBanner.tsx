import { formatPrice } from "@/modules/formatting";
type Row = { name: string; price: number };
type Props = { data: any };
export default function PriceBoardBanner({ data }: Props) {
  const { title, rows = [], note } = data || {};
  return (
    <div data-template="price-board" className="tpl full">
      <div className="board">
        {title && <h1 className="title">{title}</h1>}
        <div className="rows">
          {Array.isArray(rows) &&
            rows.map((r: Row, i: number) => (
              <div className="row" key={i}>
                <span className="name">{r.name}</span>
                <span className="dots" />
                <span className="price">
                  {data.__currency
                    ? formatPrice(
                        String(r.price),
                        data.__currency,
                        data.__locale || "en",
                      )
                    : String(r.price)}
                </span>
              </div>
            ))}
        </div>
        {note && <div className="note">{note}</div>}
      </div>
    </div>
  );
}
