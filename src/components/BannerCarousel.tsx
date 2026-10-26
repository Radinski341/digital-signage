"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Banner } from "@/lib/defaultBanners";

type Props = {
  banners: Banner[];
  durationMs: number;
  transition: "fade" | "slide";
};

export default function BannerCarousel({
  banners,
  durationMs,
  transition,
}: Props) {
  const [idx, setIdx] = useState(0);
  const intervalRef = useRef<number | null>(null);

  const effective = useMemo(() => banners.filter(Boolean), [banners]);

  useEffect(() => {
    if (intervalRef.current) window.clearInterval(intervalRef.current);
    intervalRef.current = window.setInterval(
      () => {
        setIdx((prev) => (prev + 1) % Math.max(effective.length, 1));
      },
      Math.max(durationMs, 1500),
    );
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
  }, [durationMs, effective.length]);

  if (!effective.length) {
    return (
      <div
        className="slider-root"
        style={{ display: "grid", placeItems: "center" }}
      >
        <div style={{ color: "#999" }}>No banners selected.</div>
      </div>
    );
  }

  if (transition === "slide") {
    return (
      <div className="slider-root">
        <div
          className="track"
          style={{
            width: `${effective.length * 100}%`,
            transform: `translateX(-${idx * (100 / effective.length)}%)`,
          }}
        >
          {effective.map((b) => (
            <div className="panel" key={b.id}>
              <img src={b.src} alt={b.title} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Fade
  return (
    <div className="slider-root">
      {effective.map((b, i) => (
        <div key={b.id} className={`slide fade ${i === idx ? "active" : ""}`}>
          <img src={b.src} alt={b.title} />
        </div>
      ))}
    </div>
  );
}
