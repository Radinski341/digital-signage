"use client";
import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapPin } from "lucide-react";
import type { PublicLocation } from "./Locations";
import { coordinateLocations } from "@/modules/locations";

export default function LocationsMap({
  locations,
  selected,
  onSelect,
  locale,
  loadingLabel,
  unavailableLabel,
  mapLabel,
  zoomInLabel,
  zoomOutLabel,
}: {
  locations: PublicLocation[];
  selected: string;
  onSelect: (id: string) => void;
  locale: string;
  loadingLabel: string;
  unavailableLabel: string;
  mapLabel: string;
  zoomInLabel: string;
  zoomOutLabel: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const buttons = useRef<Array<{ id: string; button: HTMLButtonElement }>>([]);
  const liveSelect = useRef(onSelect);
  const currentSelected = useRef(selected);
  liveSelect.current = onSelect;
  currentSelected.current = selected;
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">(
    "loading",
  );
  useEffect(() => {
    const container = host.current;
    const points = coordinateLocations(locations);
    if (!container || !points.length) {
      setStatus("unavailable");
      return;
    }
    let disposed = false;
    let started = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let resize: ResizeObserver | undefined;
    const initialize = async () => {
      if (started) return;
      started = true;
      setStatus("loading");
      timer = setTimeout(() => {
        if (!disposed) setStatus("unavailable");
      }, 15000);
      try {
        const L = await import("leaflet");
        if (disposed) return;
        const instance = L.map(container, {
          zoomControl: false,
          scrollWheelZoom: false,
        });
        map.current = instance;
        L.control
          .zoom({ zoomInTitle: zoomInLabel, zoomOutTitle: zoomOutLabel })
          .addTo(instance);
        instance.attributionControl.setPrefix(false);
        let loaded = 0;
        let failed = 0;
        const tiles = L.tileLayer(
          "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
          {
            maxZoom: 19,
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
          },
        );
        const ready = () => {
          if (!disposed) {
            clearTimeout(timer);
            setStatus("ready");
          }
        };
        tiles.on("loading", () => {
          loaded = 0;
          failed = 0;
        });
        tiles.on("tileload", () => {
          loaded++;
          ready();
        });
        tiles.on("tileerror", () => {
          failed++;
        });
        tiles.on("load", () => {
          if (!disposed && loaded === 0 && failed > 0) {
            clearTimeout(timer);
            setStatus("unavailable");
          }
        });
        tiles.addTo(instance);
        buttons.current = points.map((location) => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "location-map-marker";
          button.textContent = location.name;
          button.setAttribute("aria-label", location.name);
          button.classList.toggle(
            "active",
            location.id === currentSelected.current,
          );
          button.setAttribute(
            "aria-pressed",
            String(location.id === currentSelected.current),
          );
          button.addEventListener("click", () =>
            liveSelect.current(location.id),
          );
          L.DomEvent.disableClickPropagation(button);
          L.marker([location.latitude, location.longitude], {
            icon: L.divIcon({
              html: button,
              className: "restaurant-map-icon",
              iconSize: [0, 0],
            }),
            keyboard: false,
          }).addTo(instance);
          return { id: location.id, button };
        });
        if (points.length > 1)
          instance.fitBounds(
            L.latLngBounds(points.map((p) => [p.latitude, p.longitude])),
            { padding: [60, 60], maxZoom: 16 },
          );
        else instance.setView([points[0].latitude, points[0].longitude], 15);
        const chosen = points.find((p) => p.id === currentSelected.current);
        if (chosen && chosen.id !== locations[0]?.id)
          instance.panTo([chosen.latitude, chosen.longitude], {
            animate: false,
          });
        resize = new ResizeObserver(() =>
          instance.invalidateSize({ pan: false }),
        );
        resize.observe(container);
      } catch {
        if (!disposed) {
          clearTimeout(timer);
          setStatus("unavailable");
        }
      }
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          observer.disconnect();
          void initialize();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(container);
    return () => {
      disposed = true;
      observer.disconnect();
      resize?.disconnect();
      clearTimeout(timer);
      map.current?.remove();
      map.current = null;
      buttons.current = [];
    };
  }, [locations, zoomInLabel, zoomOutLabel]);
  useEffect(() => {
    buttons.current.forEach(({ id, button }) => {
      button.classList.toggle("active", id === selected);
      button.setAttribute("aria-pressed", String(id === selected));
    });
    const point = coordinateLocations(locations).find(
      (location) => location.id === selected,
    );
    if (point && map.current)
      map.current.panTo([point.latitude, point.longitude], {
        animate: !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      });
  }, [selected, locations]);
  return (
    <div className="locations-map">
      <div
        ref={host}
        className="locations-map-canvas"
        role="region"
        aria-label={mapLabel}
        lang={locale}
      />
      {status !== "ready" && (
        <div className="map-message" role="status">
          <MapPin size={30} aria-hidden="true" />
          <p>{status === "loading" ? loadingLabel : unavailableLabel}</p>
        </div>
      )}
    </div>
  );
}
