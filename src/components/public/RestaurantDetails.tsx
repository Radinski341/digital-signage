import { dictionary, PublicContent } from "@/server/public";
import { isOpenAt } from "@/modules/hours";
import { safeHref } from "@/modules/security";
export function OpeningHours({
  site,
  locale,
  locationId,
}: {
  site: PublicContent;
  locale: string;
  locationId?: string;
}) {
  const location =
    site.locations.find((l) => l.id === locationId) || site.locations[0];
  const text = dictionary(site, locale);
  if (!location) return null;
  const today = site.timeZone
    ? new Intl.DateTimeFormat("en-CA", {
        timeZone: site.timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date())
    : "";
  const exception = location.exceptions.find((e: any) => e.date === today);
  return (
    <div>
      {site.timeZone && (
        <p className="opening-status">
          {isOpenAt(
            new Date(),
            site.timeZone,
            location.hours,
            location.exceptions,
          )
            ? text.open
            : text.closed}
        </p>
      )}
      {exception && (
        <p role="status">
          {exception.label || exception.date}:{" "}
          {exception.closed
            ? text.closed
            : exception.intervals
                .map((h: any) => `${h.opens}–${h.closes}`)
                .join(", ")}
        </p>
      )}
      <dl className="hours-list">
        {[1, 2, 3, 4, 5, 6, 0].map((day) => {
          const label = new Intl.DateTimeFormat(locale, {
            weekday: "long",
            timeZone: "UTC",
          }).format(new Date(Date.UTC(2024, 0, 7 + day)));
          const intervals = location.hours.filter(
            (h: any) => h.weekday === day,
          );
          return (
            <div key={day}>
              <dt>{label}</dt>
              <dd>
                {intervals.length
                  ? intervals
                      .map(
                        (h: any) =>
                          `${h.opens}–${h.closes}${h.nextDay ? " (+1)" : ""}`,
                      )
                      .join(", ")
                  : text.closed}
              </dd>
            </div>
          );
        })}
      </dl>
      {site.timeZone && <small>{site.timeZone}</small>}
    </div>
  );
}
export function ContactDetails({
  site,
  locale,
  locationId,
}: {
  site: PublicContent;
  locale: string;
  locationId?: string;
}) {
  const locations = locationId
    ? site.locations.filter((l) => l.id === locationId)
    : site.locations;
  const text = dictionary(site, locale);
  return (
    <div className="contact-details">
      {site.profile?.phone && (
        <p>
          <a href={"tel:" + site.profile.phone.replace(/[ ()]/g, "")}>
            {site.profile.phone}
          </a>
        </p>
      )}
      {site.profile?.email && (
        <p>
          <a href={"mailto:" + site.profile.email}>{site.profile.email}</a>
        </p>
      )}
      {locations.map((l) => (
        <address key={l.id}>
          <strong>{l.name}</strong>
          <br />
          {l.address}
          <br />
          {l.postalCode} {l.city}, {l.country}
          {safeHref(l.directionsUrl) && (
            <p>
              <a
                href={l.directionsUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {text.directions} ↗
              </a>
            </p>
          )}
        </address>
      ))}
    </div>
  );
}
