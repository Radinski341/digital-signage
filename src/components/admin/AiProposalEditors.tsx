"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldInput } from "@/components/BannerForm";
export default function AiProposalEditor({
  operation,
  context,
  onSave,
  onDirty,
}: {
  operation: any;
  context: any;
  onSave: (payload: any) => Promise<void>;
  onDirty: (v: boolean) => void;
}) {
  const [value, setValue] = useState(operation.payload);
  const update = (patch: any) => {
    setValue((v: any) => ({ ...v, ...patch }));
    onDirty(true);
  };
  const label = (row: any) =>
    row.name || row.translations?.[0]?.name || row.key || "Untitled";
  const input = (key: string, title: string, type = "text") => (
    <label className="admin-form-field">
      <span>{title}</span>
      <input
        className="admin-input"
        type={type}
        value={value[key] ?? ""}
        onChange={(e) =>
          update({
            [key]: type === "number" ? Number(e.target.value) : e.target.value,
          })
        }
      />
    </label>
  );
  return (
    <form
      className="content-form"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await onSave(value);
        } catch {
          /* The workspace displays the save error and keeps this editor open. */
        }
      }}
    >
      {operation.resource === "media" && (
        <>
          {input("alt", "Image alt text")}
          {input("caption", "Caption")}
        </>
      )}
      {operation.resource === "slides" && (
        <>
          {input("name", "Playlist name")}
          {input("speedMs", "Time per banner (milliseconds)", "number")}
          <label className="admin-form-field">
            Transition
            <select
              className="admin-input"
              value={value.effect || "FADE"}
              onChange={(e) => update({ effect: e.target.value })}
            >
              <option>FADE</option>
              <option>SLIDE</option>
            </select>
          </label>
          <fieldset>
            <legend>Playlist banners</legend>
            {(value.bannerIds || []).map((id: string, index: number) => (
              <div key={id} className="ai-builder-row">
                <span>
                  {label(context.banners.find((b: any) => b.id === id) || {})}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!index}
                  onClick={() => {
                    const ids = [...value.bannerIds];
                    [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]];
                    update({ bannerIds: ids });
                  }}
                >
                  Move up
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={index === value.bannerIds.length - 1}
                  onClick={() => {
                    const ids = [...value.bannerIds];
                    [ids[index + 1], ids[index]] = [ids[index], ids[index + 1]];
                    update({ bannerIds: ids });
                  }}
                >
                  Move down
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    update({
                      bannerIds: value.bannerIds.filter(
                        (v: string) => v !== id,
                      ),
                    })
                  }
                >
                  Remove
                </Button>
              </div>
            ))}
            <label className="admin-form-field">
              Add banner
              <select
                className="admin-input"
                value=""
                onChange={(e) =>
                  e.target.value &&
                  update({
                    bannerIds: [...(value.bannerIds || []), e.target.value],
                  })
                }
              >
                <option value="">Choose a banner</option>
                {context.banners
                  .filter((b: any) => !value.bannerIds?.includes(b.id))
                  .map((b: any) => (
                    <option key={b.id} value={b.id}>
                      {label(b)}
                    </option>
                  ))}
              </select>
            </label>
          </fieldset>
        </>
      )}
      {operation.resource === "banners" && (
        <>
          <label className="admin-form-field">
            Template
            <select
              className="admin-input"
              value={value.templateId || ""}
              onChange={(e) => update({ templateId: e.target.value })}
            >
              <option value="">Choose template</option>
              {context.templates.map((t: any) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-form-field">
            Content source
            <select
              className="admin-input"
              value={
                value.menuCategoryId
                  ? "CATEGORY"
                  : value.menuItemId
                    ? "ITEM"
                    : "MANUAL"
              }
              onChange={(e) =>
                update({
                  menuCategoryId:
                    e.target.value === "CATEGORY"
                      ? context.categories[0]?.id
                      : null,
                  menuItemId:
                    e.target.value === "ITEM" ? context.items[0]?.id : null,
                })
              }
            >
              <option value="MANUAL">Manual content</option>
              <option value="CATEGORY">Menu category</option>
              <option value="ITEM">Menu dish</option>
            </select>
          </label>
          {["menuCategoryId", "menuItemId"].map(
            (key, index) =>
              value[key] && (
                <label className="admin-form-field" key={key}>
                  {index ? "Dish" : "Category"}
                  <select
                    className="admin-input"
                    value={value[key]}
                    onChange={(e) => update({ [key]: e.target.value })}
                  >
                    {context[index ? "items" : "categories"].map((r: any) => (
                      <option key={r.id} value={r.id}>
                        {label(r)}
                      </option>
                    ))}
                  </select>
                </label>
              ),
          )}
          <label className="admin-form-field">
            Language
            <select
              className="admin-input"
              value={value.sourceLocale || context.site.defaultLocale}
              onChange={(e) => update({ sourceLocale: e.target.value })}
            >
              {context.locales.map((l: any) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          {(
            context.templates.find((t: any) => t.id === value.templateId)
              ?.fields || []
          ).map((f: any) => (
            <FieldInput
              key={f.key}
              field={f}
              value={value.data?.[f.key]}
              media={context.media}
              setValue={(v) => update({ data: { ...value.data, [f.key]: v } })}
            />
          ))}
        </>
      )}
      {operation.resource === "templates" && (
        <>
          {input("name", "Template name")}
          {(value.fields || []).map((f: any, index: number) => (
            <fieldset key={index}>
              <legend>Field {index + 1}</legend>
              <div className="form-grid">
                {["key", "label"].map((k) => (
                  <label key={k} className="admin-form-field">
                    {k === "key" ? "Field key" : "Field label"}
                    <input
                      className="admin-input"
                      value={f[k] || ""}
                      onChange={(e) =>
                        update({
                          fields: value.fields.map((x: any, i: number) =>
                            i === index ? { ...x, [k]: e.target.value } : x,
                          ),
                        })
                      }
                    />
                  </label>
                ))}
                <label className="admin-form-field">
                  Field type
                  <select
                    className="admin-input"
                    value={f.type}
                    onChange={(e) =>
                      update({
                        fields: value.fields.map((x: any, i: number) =>
                          i === index ? { ...x, type: e.target.value } : x,
                        ),
                      })
                    }
                  >
                    {[
                      "TEXT",
                      "NUMBER",
                      "IMAGE",
                      "RICHTEXT",
                      "BOOLEAN",
                      "SELECT",
                      "COLOR",
                    ].map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </label>
                {["required", "isArray"].map((k) => (
                  <label className="admin-check" key={k}>
                    <input
                      type="checkbox"
                      checked={!!f[k]}
                      onChange={(e) =>
                        update({
                          fields: value.fields.map((x: any, i: number) =>
                            i === index ? { ...x, [k]: e.target.checked } : x,
                          ),
                        })
                      }
                    />
                    {k === "isArray" ? "Repeating values" : "Required"}
                  </label>
                ))}
                {f.type === "SELECT" && (
                  <label className="admin-form-field">
                    Choices, separated by commas
                    <input
                      className="admin-input"
                      value={(f.config?.options || []).join(",")}
                      onChange={(e) =>
                        update({
                          fields: value.fields.map((x: any, i: number) =>
                            i === index
                              ? {
                                  ...x,
                                  config: {
                                    ...x.config,
                                    options: e.target.value
                                      .split(",")
                                      .map((v) => v.trim()),
                                  },
                                }
                              : x,
                          ),
                        })
                      }
                    />
                  </label>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                onClick={() =>
                  update({
                    fields: value.fields.filter(
                      (_: any, i: number) => i !== index,
                    ),
                  })
                }
              >
                Remove field
              </Button>
            </fieldset>
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              update({
                fields: [
                  ...(value.fields || []),
                  {
                    key: "field" + ((value.fields || []).length + 1),
                    label: "New field",
                    type: "TEXT",
                    required: false,
                    isArray: false,
                  },
                ],
              })
            }
          >
            Add field
          </Button>
        </>
      )}
      <Button type="submit">Save to proposal</Button>
    </form>
  );
}
