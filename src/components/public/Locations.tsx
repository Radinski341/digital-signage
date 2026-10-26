"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import { ArrowUpRight } from "lucide-react";
export type PublicLocation = {
  id: string;
  name: string;
  address: string;
  city: string;
  postalCode?: string | null;
  country: string;
  latitude?: number | null;
  longitude?: number | null;
  directionsUrl?: string | null;
};
const LocationsMap = dynamic(() => import("./LocationsMap"), {
  ssr: false,
});
export default function Locations({
  locations,
  strings,
  locale,
}: {
  locations: PublicLocation[];
  strings: Record<string, string>;
  locale: string;
}) {
  const [selected, setSelected] = useState(locations[0]?.id || "");
  if (!locations.length) return <p>{strings.noLocations}</p>;
  return (
    <div className="locations-layout">
      <div className="locations-list">
        {locations.map((location) => (
          <article
            key={location.id}
            className={selected === location.id ? "selected" : ""}
          >
            <button
              type="button"
              aria-pressed={selected === location.id}
              onClick={() => setSelected(location.id)}
            >
              <strong>{location.name}</strong>
              <span>
                {location.city}, {location.address}
              </span>
              {location.postalCode && <span>{location.postalCode}</span>}
            </button>
            {location.directionsUrl && (
              <a
                href={location.directionsUrl!}
                target="_blank"
                rel="noopener noreferrer"
              >
                {strings.directions}
                <ArrowUpRight size={14} aria-hidden="true" />
              </a>
            )}
          </article>
        ))}
      </div>
      <div className="locations-map-shell">
        <LocationsMap
          locations={locations}
          selected={selected}
          onSelect={setSelected}
          locale={locale}
          loadingLabel={strings.mapLoading}
          unavailableLabel={strings.mapUnavailable}
          mapLabel={strings.locationMap}
          zoomInLabel={strings.zoomIn}
          zoomOutLabel={strings.zoomOut}
        />
      </div>
    </div>
  );
}
