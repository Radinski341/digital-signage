"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import { sectionDefinitions, SectionType } from "@/modules/sections/schema";
import { Button } from "@/components/ui/button";
import { MediaPicker } from "./MediaPicker";
import SortableList from "./SortableList";
const RichTextEditor = dynamic(() => import("./RichTextEditor"), {
  ssr: false,
  loading: () => <p>Loading editor…</p>,
});
export default function PageBuilder({
  sections,
  onChange,
  context,
}: {
  sections: any[];
  onChange: (value: any[]) => void;
  context: any;
}) {
  const [type, setType] = useState<SectionType>("HERO");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [locale, setLocale] = useState(context.site.defaultLocale);
  const active = sections.map((s, i) => ({ ...s, id: s.id || `section-${i}` }));
  function update(index: number, patch: any) {
    onChange(sections.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }
  function add() {
    const id = crypto.randomUUID();
    const section = {
      id,
      type,
      hidden: false,
      config: sectionDefinitions[type].schema.parse({}),
      translations: [
        {
          locale: context.site.defaultLocale,
          content: { heading: "", subtitle: "", caption: "", alt: "" },
        },
      ],
    };
    onChange([...sections, section]);
    setExpanded(id);
  }
  const labelFor = (row: any) =>
    row.translations?.find((t: any) => t.locale === context.site.defaultLocale)
      ?.name ||
    row.internalName ||
    row.name ||
    row.id;
  return (
    <section className="page-builder">
      <div className="form-section-heading">
        <div>
          <h2>Page sections</h2>
          <p>Build the page with reusable content sections.</p>
        </div>
        <label>
          Editing language
          <select
            className="admin-input"
            value={locale}
            onChange={(e) => setLocale(e.target.value)}
          >
            {context.locales.map((l: any) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <SortableList
        items={active}
        onChange={onChange}
        render={(s, index) => {
          const translation = s.translations.find(
            (t: any) => t.locale === locale,
          );
          const content = translation?.content ?? {};
          function setContent(key: string, value: any) {
            const values = s.translations.filter(
              (t: any) => t.locale !== locale,
            );
            update(index, {
              translations: [
                ...values,
                { locale, content: { ...content, [key]: value } },
              ],
            });
          }
          function setConfig(key: string, value: any) {
            update(index, { config: { ...s.config, [key]: value } });
          }
          function move(delta: number) {
            const list = [...sections];
            const target = index + delta;
            if (target < 0 || target >= list.length) return;
            [list[index], list[target]] = [list[target], list[index]];
            onChange(list);
          }
          const open = expanded === s.id;
          return (
            <div className="section-card">
              <div className="section-card-heading">
                <button
                  type="button"
                  onClick={() => setExpanded(open ? null : s.id)}
                  aria-expanded={open}
                >
                  <strong>
                    {sectionDefinitions[s.type as SectionType]?.label || s.type}
                  </strong>
                  <span>{content.heading || "Add content"}</span>
                </button>
                <div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={index === 0}
                    onClick={() => move(-1)}
                    aria-label="Move section up"
                  >
                    ↑
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={index === sections.length - 1}
                    onClick={() => move(1)}
                    aria-label="Move section down"
                  >
                    ↓
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      const copy = {
                        ...structuredClone(s),
                        id: crypto.randomUUID(),
                      };
                      onChange([
                        ...sections.slice(0, index + 1),
                        copy,
                        ...sections.slice(index + 1),
                      ]);
                    }}
                  >
                    Duplicate
                  </Button>
                </div>
              </div>
              {open && (
                <div className="section-editor">
                  <label className="admin-check">
                    <input
                      type="checkbox"
                      checked={s.hidden}
                      onChange={(e) =>
                        update(index, { hidden: e.target.checked })
                      }
                    />
                    Hide this section
                  </label>
                  {s.type !== "DIVIDER" && (
                    <>
                      <label>
                        Heading
                        <input
                          className="admin-input"
                          value={content.heading ?? ""}
                          onChange={(e) =>
                            setContent("heading", e.target.value)
                          }
                        />
                      </label>
                      {["HERO", "IMAGE_TEXT", "CTA"].includes(s.type) && (
                        <label>
                          Subtitle
                          <textarea
                            className="admin-input"
                            value={content.subtitle ?? ""}
                            onChange={(e) =>
                              setContent("subtitle", e.target.value)
                            }
                          />
                        </label>
                      )}
                      {["RICH_TEXT", "IMAGE_TEXT"].includes(s.type) && (
                        <RichTextEditor
                          value={content.body}
                          onChange={(v) => setContent("body", v)}
                          media={context.media}
                        />
                      )}
                    </>
                  )}
                  {["HERO", "IMAGE", "IMAGE_TEXT"].includes(s.type) && (
                    <>
                      <MediaPicker
                        media={context.media}
                        value={s.config.imageId}
                        onChange={(id) => setConfig("imageId", id)}
                      />
                      <label>
                        Image alt text
                        <input
                          className="admin-input"
                          value={content.alt ?? ""}
                          onChange={(e) => setContent("alt", e.target.value)}
                        />
                      </label>
                    </>
                  )}
                  {s.type === "IMAGE" && (
                    <label>
                      Caption
                      <input
                        className="admin-input"
                        value={content.caption ?? ""}
                        onChange={(e) => setContent("caption", e.target.value)}
                      />
                    </label>
                  )}
                  {["HERO", "IMAGE_TEXT", "CTA"].includes(s.type) && (
                    <label>
                      Buttons
                      <select
                        className="admin-input"
                        multiple
                        value={s.config.actionIds ?? []}
                        onChange={(e) =>
                          setConfig(
                            "actionIds",
                            Array.from(
                              e.target.selectedOptions,
                              (o) => o.value,
                            ),
                          )
                        }
                      >
                        {context.actions.map((a: any) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                      <small>Use Ctrl / Command to select more than one.</small>
                    </label>
                  )}
                  {s.type === "GALLERY" && (
                    <div>
                      <MediaPicker
                        media={context.media}
                        label="Add gallery photograph"
                        onChange={(id) => {
                          if (id && !s.config.imageIds.includes(id))
                            setConfig("imageIds", [...s.config.imageIds, id]);
                        }}
                      />
                      {s.config.imageIds.map((id: string, position: number) => (
                        <div key={id} className="inline-fields">
                          <span>
                            {context.media.find((m: any) => m.id === id)?.alt ||
                              "Gallery photograph"}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            disabled={!position}
                            onClick={() => {
                              const ids = [...s.config.imageIds];
                              [ids[position - 1], ids[position]] = [
                                ids[position],
                                ids[position - 1],
                              ];
                              setConfig("imageIds", ids);
                            }}
                          >
                            Move up
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            disabled={position === s.config.imageIds.length - 1}
                            onClick={() => {
                              const ids = [...s.config.imageIds];
                              [ids[position + 1], ids[position]] = [
                                ids[position],
                                ids[position + 1],
                              ];
                              setConfig("imageIds", ids);
                            }}
                          >
                            Move down
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() =>
                              setConfig(
                                "imageIds",
                                s.config.imageIds.filter(
                                  (v: string) => v !== id,
                                ),
                              )
                            }
                          >
                            Remove
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  {s.type === "MENU_HIGHLIGHTS" && (
                    <>
                      <label>
                        Selected categories
                        <select
                          className="admin-input"
                          multiple
                          value={s.config.categoryIds ?? []}
                          onChange={(e) =>
                            setConfig(
                              "categoryIds",
                              Array.from(
                                e.target.selectedOptions,
                                (o) => o.value,
                              ),
                            )
                          }
                        >
                          {context.categories.map((c: any) => (
                            <option key={c.id} value={c.id}>
                              {labelFor(c)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Selected dishes
                        <select
                          className="admin-input"
                          multiple
                          value={s.config.itemIds ?? []}
                          onChange={(e) =>
                            setConfig(
                              "itemIds",
                              Array.from(
                                e.target.selectedOptions,
                                (o) => o.value,
                              ),
                            )
                          }
                        >
                          {context.items.map((i: any) => (
                            <option key={i.id} value={i.id}>
                              {labelFor(i)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Maximum dishes
                        <input
                          className="admin-input"
                          type="number"
                          min={1}
                          max={24}
                          value={s.config.limit ?? 6}
                          onChange={(e) =>
                            setConfig("limit", Number(e.target.value))
                          }
                        />
                      </label>
                      <small>
                        With no selection, featured dishes appear automatically.
                      </small>
                    </>
                  )}
                  {["OPENING_HOURS", "CONTACT", "LOCATIONS"].includes(
                    s.type,
                  ) && (
                    <label>
                      Location
                      <select
                        className="admin-input"
                        value={s.config.locationId ?? ""}
                        onChange={(e) =>
                          setConfig("locationId", e.target.value || null)
                        }
                      >
                        <option value="">
                          {s.type === "LOCATIONS"
                            ? "All locations"
                            : "Primary location"}
                        </option>
                        {context.locations.map((l: any) => (
                          <option value={l.id} key={l.id}>
                            {l.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {Object.entries(s.config)
                    .filter(([key]) =>
                      [
                        "align",
                        "overlay",
                        "variant",
                        "placement",
                        "width",
                        "size",
                      ].includes(key),
                    )
                    .map(([key, value]) => {
                      const options: Record<string, string[]> = {
                        align: ["left", "center"],
                        overlay: ["none", "light", "dark"],
                        variant:
                          s.type === "HERO"
                            ? ["full", "split"]
                            : ["grid", "carousel"],
                        placement: ["left", "right"],
                        width: ["normal", "wide"],
                        size: ["small", "medium", "large"],
                      };
                      return (
                        <label key={key} className="capitalize">
                          {key}
                          <select
                            className="admin-input"
                            value={String(value)}
                            onChange={(e) => setConfig(key, e.target.value)}
                          >
                            {options[key].map((v) => (
                              <option key={v}>{v}</option>
                            ))}
                          </select>
                        </label>
                      );
                    })}
                  {s.type === "DIVIDER" && (
                    <label className="admin-check">
                      <input
                        type="checkbox"
                        checked={s.config.line}
                        onChange={(e) => setConfig("line", e.target.checked)}
                      />
                      Show dividing line
                    </label>
                  )}
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => {
                      if (window.confirm("Remove this section from the draft?"))
                        onChange(sections.filter((_, i) => i !== index));
                    }}
                  >
                    Remove section
                  </Button>
                </div>
              )}
            </div>
          );
        }}
      />
      <div className="add-section">
        <label>
          <span className="sr-only">Section type</span>
          <select
            className="admin-input"
            value={type}
            onChange={(e) => setType(e.target.value as SectionType)}
          >
            {Object.entries(sectionDefinitions).map(([key, d]) => (
              <option key={key} value={key}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
        <Button type="button" onClick={add}>
          Add section
        </Button>
      </div>
    </section>
  );
}
