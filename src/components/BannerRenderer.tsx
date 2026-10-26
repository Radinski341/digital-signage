import HeroDishBanner from "./templates/HeroDishBanner";
import TitleListBanner from "./templates/TitleListBanner";
import TwoImagePromoBanner from "./templates/TwoImagePromoBanner";
import PriceBoardBanner from "./templates/PriceBoardBanner";
import MenuBanner from "./templates/MenuBanner";
import type { DynamicField } from "@/modules/signage";
const renderers = {
  "hero-dish": HeroDishBanner,
  "title-list": TitleListBanner,
  "two-image-promo": TwoImagePromoBanner,
  "price-board": PriceBoardBanner,
  menu: MenuBanner,
};
function readable(value: unknown): string {
  if (Array.isArray(value)) return value.map(readable).join(" • ");
  if (value && typeof value === "object")
    return Object.values(value).map(readable).join(" · ");
  return String(value ?? "");
}
export default function BannerRenderer({
  templateKey,
  data,
  fields = [],
}: {
  templateKey: string;
  data: any;
  fields?: DynamicField[];
}) {
  const Component = renderers[templateKey as keyof typeof renderers];
  if (data?.__hidden) return <div className="signage-canvas" />;
  return (
    <div className="signage-canvas">
      {Component ? (
        <Component data={data} />
      ) : (
        <div
          className="tpl full"
          style={{
            padding: "5cqw",
            background: "#171717",
            display: "grid",
            alignContent: "center",
            gap: 24,
            color: "white",
          }}
        >
          {fields.map((f) =>
            f.type === "IMAGE" && typeof data?.[f.key] === "string" ? (
              <img
                key={f.key}
                src={data[f.key]}
                alt={f.label}
                style={{ maxHeight: "50cqh", maxWidth: "100%" }}
              />
            ) : (
              <div key={f.key} style={{ fontSize: "2.5cqw" }}>
                <strong>{f.label}</strong>
                <div>{readable(data?.[f.key])}</div>
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}
