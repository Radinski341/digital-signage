"use client";

import { useEffect, useMemo, useState } from "react";
import { Banner } from "@/lib/defaultBanners";
import {
  BannerConfig,
  loadAllBanners,
  loadConfig,
  saveConfig,
} from "@/lib/storage";
import Link from "next/link";

type Item = Banner & { enabled: boolean };

export default function SettingsForm() {
  const [all, setAll] = useState<Banner[]>([]);
  const [enabledIds, setEnabledIds] = useState<string[]>([]);
  const [durationMs, setDurationMs] = useState<number>(8000);
  const [transition, setTransition] = useState<"fade" | "slide">("fade");
  const [saved, setSaved] = useState<null | string>(null);

  useEffect(() => {
    const banners = loadAllBanners();
    const cfg = loadConfig();

    // Ensure enabledIds only includes existing banners; preserve order
    const validIds = cfg.enabledIds.filter((id) =>
      banners.some((b) => b.id === id),
    );
    const missing = banners
      .map((b) => b.id)
      .filter((id) => !validIds.includes(id));
    const combined = [...validIds, ...missing];

    setAll(banners);
    setEnabledIds(combined);
    setDurationMs(cfg.durationMs);
    setTransition(cfg.transition);
  }, []);

  const items: Item[] = useMemo(() => {
    const enabledSet = new Set(enabledIds);
    // preserve order of enabledIds first, then the rest
    const ordered = [
      ...(enabledIds
        .map((id) => all.find((b) => b.id === id))
        .filter(Boolean) as Banner[]),
      ...all.filter((b) => !enabledSet.has(b.id)),
    ];
    return ordered.map((b) => ({ ...b, enabled: enabledSet.has(b.id) }));
  }, [all, enabledIds]);

  function toggle(id: string) {
    setEnabledIds((prev) => {
      const set = new Set(prev);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      // preserve existing order; when adding, append to the end
      return Array.from(
        all.reduce<string[]>((acc, b) => {
          if (set.has(b.id)) acc.push(b.id);
          return acc;
        }, []),
      );
    });
  }

  function move(id: string, dir: "up" | "down") {
    setEnabledIds((prev) => {
      const arr = [...prev];
      const i = arr.indexOf(id);
      if (i === -1) return prev;
      const j = dir === "up" ? i - 1 : i + 1;
      if (j < 0 || j >= arr.length) return prev;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return arr;
    });
  }

  function save() {
    const cfg: BannerConfig = {
      enabledIds,
      durationMs: Math.max(1500, durationMs),
      transition,
    };
    saveConfig(cfg);
    setSaved(new Date().toLocaleTimeString());
    setTimeout(() => setSaved(null), 2500);
  }

  return (
    <div className="container">
      <h1 style={{ marginBottom: 12 }}>Settings</h1>
      <p style={{ color: "var(--muted)", marginTop: 0, marginBottom: 24 }}>
        Select banners, set order, and configure timing/transition. Changes are
        saved in <code>localStorage</code>.
      </p>

      <div
        style={{
          display: "flex",
          gap: 24,
          flexWrap: "wrap",
          alignItems: "flex-start",
        }}
      >
        <div style={{ flex: "1 1 600px", minWidth: 420 }}>
          <h3 style={{ margin: "8px 0 12px" }}>Banners</h3>
          <div style={{ display: "grid", gap: 10 }}>
            {items.map((b) => (
              <div className="banner-item" key={b.id}>
                <div className="thumb">
                  <img src={b.src} alt={b.title} />
                </div>
                <div>
                  <div style={{ fontWeight: 600 }}>{b.title}</div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>
                    {b.id}
                  </div>
                </div>
                <div className="controls">
                  {b.enabled ? (
                    <>
                      <button onClick={() => move(b.id, "up")} title="Move up">
                        ↑
                      </button>
                      <button
                        onClick={() => move(b.id, "down")}
                        title="Move down"
                      >
                        ↓
                      </button>
                      <button onClick={() => toggle(b.id)} title="Disable">
                        Disable
                      </button>
                    </>
                  ) : (
                    <button onClick={() => toggle(b.id)} title="Enable">
                      Enable
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ flex: "0 0 320px" }}>
          <h3 style={{ margin: "8px 0 12px" }}>Playback</h3>
          <div style={{ display: "grid", gap: 12 }}>
            <label>
              <div style={{ marginBottom: 6 }}>Slide duration (ms)</div>
              <input
                type="number"
                min={1500}
                step={500}
                value={durationMs}
                onChange={(e) => setDurationMs(Number(e.target.value))}
              />
            </label>

            <label>
              <div style={{ marginBottom: 6 }}>Transition</div>
              <select
                value={transition}
                onChange={(e) =>
                  setTransition(e.target.value as "fade" | "slide")
                }
              >
                <option value="fade">Fade</option>
                <option value="slide">Slide</option>
              </select>
            </label>

            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button onClick={save}>Save</button>
              {saved && (
                <div style={{ color: "var(--accent)", alignSelf: "center" }}>
                  Saved at {saved}
                </div>
              )}
            </div>

            <div style={{ marginTop: 16 }}>
              <Link href="/">← Back to Display</Link>
            </div>

            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 16 }}>
              To add/remove actual files, place images in{" "}
              <code>/public/banners</code> and reference them in{" "}
              <code>lib/defaultBanners.ts</code>. Runtime uploads to{" "}
              <code>public/</code> are not possible without a server or SDK.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
