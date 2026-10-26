// src/components/BannerPreview.tsx
import BannerRenderer from "./BannerRenderer";

export default function BannerPreview({
  templateKey,
  data,
  fields,
}: {
  templateKey: string;
  data: any;
  fields?: import("@/modules/signage").DynamicField[];
}) {
  return (
    <div
      style={{
        width: "300px",
        height: "169px",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "1920px",
          height: "1080px",
          transform: "scale(0.15625)",
          transformOrigin: "top left",
        }}
        className="preview"
      >
        <BannerRenderer templateKey={templateKey} data={data} fields={fields} />
      </div>
    </div>
  );
}
