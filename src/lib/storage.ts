"use client";

import { defaultBanners, Banner } from "./defaultBanners";

export type Transition = "fade" | "slide";

export type BannerConfig = {
  enabledIds: string[]; // which banners are included, in order
  durationMs: number; // per-slide duration
  transition: Transition; // fade or slide
};

const STORAGE_KEY = "tv-menu.config.v1";

export function loadAllBanners(): Banner[] {
  // For now, we always return default list.
  // If someday you want to load from localStorage, read BANNERS_KEY here.
  return defaultBanners;
}

export function loadConfig(): BannerConfig {
  if (typeof window === "undefined") {
    // SSR guard
    return {
      enabledIds: defaultBanners.map((b) => b.id),
      durationMs: 8000,
      transition: "fade",
    };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        enabledIds: defaultBanners.map((b) => b.id),
        durationMs: 8000,
        transition: "fade",
      };
    }
    const parsed = JSON.parse(raw) as BannerConfig;

    // Validate & fallback
    const ids = parsed.enabledIds?.length
      ? parsed.enabledIds
      : defaultBanners.map((b) => b.id);

    const duration =
      typeof parsed.durationMs === "number" && parsed.durationMs >= 1500
        ? parsed.durationMs
        : 8000;

    const transition: any = parsed.transition === "slide" ? "slide" : "fade";

    return { enabledIds: ids, durationMs: duration, transition };
  } catch {
    return {
      enabledIds: defaultBanners.map((b) => b.id),
      durationMs: 8000,
      transition: "fade",
    };
  }
}

export function saveConfig(cfg: BannerConfig) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}
