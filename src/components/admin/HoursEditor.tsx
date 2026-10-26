"use client";
import { Button } from "@/components/ui/button";
const weekdays = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
export default function HoursEditor({
  value,
  onChange,
  exceptions,
  onExceptions,
}: {
  value: any[];
  onChange: (v: any[]) => void;
  exceptions: any[];
  onExceptions: (v: any[]) => void;
}) {
  function intervals(rows: any[], change: (v: any[]) => void) {
    return rows.map((h, index) => (
      <div className="hours-interval" key={index}>
        <label>
          Opens
          <input
            className="admin-input"
            type="time"
            value={h.opens}
            onChange={(e) =>
              change(
                rows.map((r, i) =>
                  i === index ? { ...r, opens: e.target.value } : r,
                ),
              )
            }
          />
        </label>
        <label>
          Closes
          <input
            className="admin-input"
            type="time"
            value={h.closes}
            onChange={(e) =>
              change(
                rows.map((r, i) =>
                  i === index ? { ...r, closes: e.target.value } : r,
                ),
              )
            }
          />
        </label>
        <label className="admin-check">
          <input
            type="checkbox"
            checked={h.nextDay}
            onChange={(e) =>
              change(
                rows.map((r, i) =>
                  i === index ? { ...r, nextDay: e.target.checked } : r,
                ),
              )
            }
          />
          Next day
        </label>
        <Button
          type="button"
          variant="ghost"
          onClick={() => change(rows.filter((_, i) => i !== index))}
        >
          Remove
        </Button>
      </div>
    ));
  }
  return (
    <section className="form-section">
      <h2>Weekly opening hours</h2>
      <p>Times use the restaurant time zone. No intervals means closed.</p>
      {[1, 2, 3, 4, 5, 6, 0].map((day) => {
        const rows = value.filter((h) => h.weekday === day);
        return (
          <div key={day} className="hours-day">
            <strong>{weekdays[day]}</strong>
            <div>
              {intervals(rows, (v) =>
                onChange([
                  ...value.filter((h) => h.weekday !== day),
                  ...v.map((h) => ({ ...h, weekday: day })),
                ]),
              )}
              {!rows.length && <span className="muted">Closed</span>}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  onChange([
                    ...value,
                    {
                      weekday: day,
                      opens: "09:00",
                      closes: "17:00",
                      nextDay: false,
                    },
                  ])
                }
              >
                Add interval
              </Button>
            </div>
          </div>
        );
      })}
      <h2>Holidays & exceptions</h2>
      {exceptions.map((exception, index) => (
        <div className="exception-card" key={index}>
          <label>
            Date
            <input
              className="admin-input"
              type="date"
              value={exception.date}
              onChange={(e) =>
                onExceptions(
                  exceptions.map((x, i) =>
                    i === index ? { ...x, date: e.target.value } : x,
                  ),
                )
              }
            />
          </label>
          <label>
            Label
            <input
              className="admin-input"
              value={exception.label || ""}
              placeholder="Holiday or temporary hours"
              onChange={(e) =>
                onExceptions(
                  exceptions.map((x, i) =>
                    i === index ? { ...x, label: e.target.value } : x,
                  ),
                )
              }
            />
          </label>
          <label className="admin-check">
            <input
              type="checkbox"
              checked={exception.closed}
              onChange={(e) =>
                onExceptions(
                  exceptions.map((x, i) =>
                    i === index ? { ...x, closed: e.target.checked } : x,
                  ),
                )
              }
            />
            Closed
          </label>
          {!exception.closed && (
            <>
              {intervals(exception.intervals, (v) =>
                onExceptions(
                  exceptions.map((x, i) =>
                    i === index ? { ...x, intervals: v } : x,
                  ),
                ),
              )}
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  onExceptions(
                    exceptions.map((x, i) =>
                      i === index
                        ? {
                            ...x,
                            intervals: [
                              ...x.intervals,
                              {
                                opens: "09:00",
                                closes: "17:00",
                                nextDay: false,
                              },
                            ],
                          }
                        : x,
                    ),
                  )
                }
              >
                Add interval
              </Button>
            </>
          )}
          <Button
            type="button"
            variant="ghost"
            onClick={() =>
              onExceptions(exceptions.filter((_, i) => i !== index))
            }
          >
            Remove exception
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        onClick={() =>
          onExceptions([
            ...exceptions,
            { date: "", label: "", closed: true, intervals: [] },
          ])
        }
      >
        Add special date
      </Button>
    </section>
  );
}
