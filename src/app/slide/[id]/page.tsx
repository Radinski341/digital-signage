"use client";

import BannerRenderer from "@/components/BannerRenderer";
import { use, useEffect, useMemo, useRef, useState } from "react";

type Slide = {
  id: string;
  name: string;
  speedMs: number;
  effect: "FADE" | "SLIDE";
  updatedAt: string;
  items: {
    id: string;
    order: number;
    banner: { id: string; data: any; template: { fields: any[] } };
  }[];
};

export default function SlidePlayer({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [error, setError] = useState("");
  const preview =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).has("preview");
  const [slide, setSlide] = useState<Slide | null>(null);
  const [idx, setIdx] = useState(0);
  const currentBannerRef = useRef<string | undefined>(undefined);
  const etagRef = useRef<string>("");

  const banners = useMemo(
    () => slide?.items?.map((i) => i.banner) ?? [],
    [slide],
  );

  currentBannerRef.current = banners[idx]?.id;

  useEffect(() => {
    async function load(initial = false) {
      try {
        const res = await fetch(
          `/api/slides/${id}${preview ? "?preview=1" : ""}`,
          { cache: "no-store" },
        );
        if (!res.ok) {
          setError(
            res.status === 404
              ? "This display is not published."
              : "Display temporarily unavailable.",
          );
          return;
        }
        setError("");
        const et = res.headers.get("ETag") || "";
        const data = await res.json();
        if (!Array.isArray(data.items)) return;
        if (initial || et !== etagRef.current) {
          etagRef.current = et;
          // Try to preserve current banner if still present
          const currentId = currentBannerRef.current;
          setSlide(data);
          if (currentId) {
            const newIndex = data.items.findIndex(
              (it: any) => it.banner.id === currentId,
            );
            setIdx(newIndex >= 0 ? newIndex : 0);
          } else {
            setIdx(0);
          }
        }
      } catch {
        /* Keep the last valid playlist during transient failures. */
      }
    }
    load(true);
    const int = setInterval(() => load(false), 60_000); // poll every minute
    return () => clearInterval(int);
  }, [id, preview]);

  useEffect(() => {
    if (!slide) return;
    const timer = setInterval(
      () => setIdx((i) => (i + 1) % (banners.length || 1)),
      Math.max(1500, slide.speedMs),
    );
    return () => clearInterval(timer);
  }, [slide, banners.length]);

  if (!slide)
    return (
      <div role="status" style={{ padding: 20 }}>
        {error || "Loading display…"}
      </div>
    );
  if (!banners.length) return <div style={{ padding: 20 }}>No banners</div>;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#000",
        overflow: "hidden",
      }}
    >
      {slide.effect === "SLIDE" ? (
        <SlideTrack banners={banners} idx={idx} />
      ) : (
        <FadeStack banners={banners} idx={idx} />
      )}
      <div
        style={{
          position: "fixed",
          right: 12,
          bottom: 8,
          fontSize: 12,
          color: "#aaa",
        }}
      >
        {slide.name} • {idx + 1}/{banners.length} • F=fullscreen
      </div>
      <FullscreenHotkey />
    </div>
  );
}

function FullscreenHotkey() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "f") {
        if (!document.fullscreenElement)
          document.documentElement.requestFullscreen().catch(() => {});
        else document.exitFullscreen().catch(() => {});
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return null;
}

function BannerView({ banner }: { banner: any }) {
  return (
    <BannerRenderer
      templateKey={banner.template.key}
      fields={banner.template.fields}
      data={banner.data}
    />
  );
}

function FadeStack({ banners, idx }: { banners: any[]; idx: number }) {
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      {banners.map((b, i) => (
        <div
          key={`${b.id}-${i}`}
          style={{
            position: "absolute",
            inset: 0,
            opacity: i === idx ? 1 : 0,
            transition: "opacity 700ms ease-in-out",
          }}
        >
          <BannerView banner={b} />
        </div>
      ))}
    </div>
  );
}

function SlideTrack({ banners, idx }: { banners: any[]; idx: number }) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        width: `${banners.length * 100}vw`,
        height: "100%",
        transform: `translateX(-${idx * 100}vw)`,
        transition: "transform 700ms ease-in-out",
      }}
    >
      {banners.map((b, i) => (
        <div
          key={`${b.id}-${i}`}
          style={{ minWidth: "100vw", height: "100vh", position: "relative" }}
        >
          <BannerView banner={b} />
        </div>
      ))}
    </div>
  );
}
