"use client";
import { useRef, useState } from "react";
import { AiAssistant, type AiAssistantHandle } from "./AiAssistant";
import useSWR from "swr";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { PageHeader } from "./PageHeader";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import BannerForm from "@/components/BannerForm";
import BannerPreview from "@/components/BannerPreview";
import { slugify } from "@/modules/security";
const fetcher = async (url: string) => {
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  return data;
};
async function request(url: string, body: any, method = "POST") {
  const response = await fetch(url, {
    method,
    headers:
      body instanceof FormData
        ? undefined
        : { "Content-Type": "application/json" },
    body:
      body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  if (response.status === 204) return null;
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Unable to save.");
  return data;
}
export default function SignageWorkbench({
  kind,
  context,
}: {
  kind: "banners" | "slides" | "templates";
  context: any;
}) {
  const router = useRouter();
  const assistant = useRef<AiAssistantHandle>(null);
  const { data, error, isLoading, mutate } = useSWR(`/api/${kind}`, fetcher);
  const { data: templates } = useSWR("/api/templates", fetcher);
  const { data: banners } = useSWR(
    kind === "slides" ? "/api/banners" : null,
    fetcher,
  );
  const [editing, setEditing] = useState<any>(undefined);
  const [templateId, setTemplateId] = useState("");
  const [source, setSource] = useState("MANUAL");
  const [categoryId, setCategoryId] = useState("");
  const [itemId, setItemId] = useState("");
  const [locale, setLocale] = useState(context.site.defaultLocale);
  const [selected, setSelected] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [speed, setSpeed] = useState(8000);
  const [effect, setEffect] = useState("FADE");
  const [fields, setFields] = useState<any[]>([
    {
      key: "title",
      label: "Title",
      type: "TEXT",
      required: true,
      isArray: false,
    },
  ]);
  const [busy, setBusy] = useState(false);
  const singular =
    kind === "banners" ? "banner" : kind === "slides" ? "slide" : "template";
  const title = singular.charAt(0).toUpperCase() + singular.slice(1) + "s";
  function edit(row: any) {
    setEditing(row);
    setTemplateId(row?.templateId || templates?.templates?.[0]?.id || "");
    setSource(
      row?.menuCategoryId ? "CATEGORY" : row?.menuItemId ? "ITEM" : "MANUAL",
    );
    setCategoryId(row?.menuCategoryId || "");
    setItemId(row?.menuItemId || "");
    setLocale(row?.sourceLocale || context.site.defaultLocale);
    setSelected(row?.items?.map((i: any) => i.bannerId) || []);
    setName(row?.name || "");
    setSpeed(row?.speedMs || 8000);
    setEffect(row?.effect || "FADE");
    setFields([
      {
        key: "title",
        label: "Title",
        type: "TEXT",
        required: true,
        isArray: false,
      },
    ]);
  }
  async function save(body: any) {
    setBusy(true);
    try {
      const saved = await request(
        `/api/${kind}${editing?.id ? "/" + editing.id : ""}`,
        body,
        editing?.id ? "PUT" : "POST",
      );
      await assistant.current?.attach(saved.id);
      toast.success(
        kind === "templates"
          ? "Template created."
          : "Draft saved. Publish it to update displays.",
      );
      setEditing(undefined);
      mutate();
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
      throw error;
    } finally {
      setBusy(false);
    }
  }
  async function publish(row: any, operation = "publish") {
    setBusy(true);
    try {
      await request(`/api/signage/${kind}/${row.id}/publish`, {
        version: row.version,
        operation,
      });
      toast.success(
        operation === "publish"
          ? "Display content published."
          : "Display content unpublished.",
      );
      mutate();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const rows = data?.[kind] || [];
  const template = templates?.templates?.find((t: any) => t.id === templateId);
  const labelFor = (row: any) =>
    row.translations?.find((t: any) => t.locale === context.site.defaultLocale)
      ?.name || row.name;
  return (
    <>
      <PageHeader
        title={title}
        description={
          kind === "templates"
            ? "Reusable display layouts and dynamic content fields."
            : kind === "banners"
              ? "Create manual promotions or connect a display to your live restaurant menu."
              : "Organize published banners into reliable fullscreen playlists."
        }
        actions={<Button onClick={() => edit(null)}>Add {singular}</Button>}
      />
      {kind !== "templates" && (
        <p className="admin-notice">
          Save a draft, preview it, then publish. Existing display URLs keep
          showing the last published version.
        </p>
      )}
      {error && (
        <div role="alert" className="admin-error">
          {error.message}
          <Button variant="outline" onClick={() => mutate()}>
            Retry
          </Button>
        </div>
      )}
      {isLoading ? (
        <div className="admin-skeleton" />
      ) : !rows.length ? (
        <div className="admin-empty">
          <h2>No {kind} yet</h2>
          <p>Create the first {singular} to get started.</p>
        </div>
      ) : (
        <div className="signage-grid">
          {rows.map((row: any) => (
            <article key={row.id} className="signage-card">
              <h2>{row.name || row.template?.name}</h2>
              {kind === "banners" && (
                <BannerPreview
                  templateKey={row.template.key}
                  data={row.data}
                  fields={row.template.fields}
                />
              )}
              {kind === "slides" && row.items?.[0] && (
                <BannerPreview
                  templateKey={row.items[0].banner.template.key}
                  data={row.items[0].banner.data}
                  fields={row.items[0].banner.template.fields}
                />
              )}
              {kind === "templates" ? (
                <>
                  <small>
                    {row.fields.length} fields · {row.key}
                  </small>
                  <ul>
                    {row.fields.map((f: any) => (
                      <li key={f.id} className="text-xs text-stone-500">
                        {f.label} · {f.type.toLowerCase()}
                        {f.isArray ? " list" : ""}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <>
                  <span
                    className={`status-badge ${row.status === "DRAFT" ? "draft" : ""}`}
                  >
                    {row.status}
                  </span>
                  <small>
                    {kind === "slides"
                      ? `${row.items.length} banners · ${row.speedMs / 1000}s · ${row.effect.toLowerCase()}`
                      : row.menuCategoryId
                        ? "Connected to menu category"
                        : row.menuItemId
                          ? "Connected to dish"
                          : "Manual content"}
                  </small>
                  <div className="signage-card-actions">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => edit(row)}
                    >
                      Edit
                    </Button>
                    <a
                      href={
                        kind === "banners"
                          ? `/banner/${row.id}?draft=1`
                          : `/slide/${row.id}?preview=1`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="admin-link"
                    >
                      Preview
                    </a>
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => publish(row)}
                    >
                      Publish
                    </Button>
                  </div>
                  <div className="signage-card-actions">
                    <a
                      href={
                        kind === "banners"
                          ? `/banner/${row.id}`
                          : `/slide/${row.id}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="admin-link"
                    >
                      Open live display ↗
                    </a>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        if (
                          window.confirm(
                            "Unpublish this display content? Connected players will stop showing it.",
                          )
                        )
                          await publish(row, "unpublish");
                      }}
                    >
                      Unpublish
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        if (
                          !window.confirm(
                            `Delete this ${singular}? Referenced banners cannot be deleted.`,
                          )
                        )
                          return;
                        try {
                          await request(
                            `/api/${kind}/${row.id}`,
                            null,
                            "DELETE",
                          );
                          toast.success("Deleted.");
                          mutate();
                        } catch (error) {
                          toast.error((error as Error).message);
                        }
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </>
              )}
            </article>
          ))}
        </div>
      )}
      <Dialog
        open={editing !== undefined}
        onOpenChange={(open) => {
          if (
            !open &&
            !busy &&
            window.confirm("Close this editor? Unsaved changes will be lost.")
          )
            setEditing(undefined);
        }}
      >
        <DialogContent>
          <DialogTitle className="dialog-title">
            {editing ? "Edit" : "Create"} {singular}
          </DialogTitle>
          <DialogDescription>
            {kind === "banners"
              ? "Choose a layout and its content source."
              : "Changes remain in draft until you publish."}
          </DialogDescription>
          {kind === "banners" && (
            <div className="content-form">
              <label>
                Template
                <select
                  className="admin-input"
                  value={templateId}
                  disabled={Boolean(editing)}
                  onChange={(e) => setTemplateId(e.target.value)}
                >
                  {templates?.templates?.map((t: any) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Content source
                <select
                  className="admin-input"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                >
                  <option value="MANUAL">Manual content</option>
                  <option value="CATEGORY">
                    Live menu category (menu / price board layouts)
                  </option>
                  <option value="ITEM">Live dish (hero layout)</option>
                </select>
              </label>
              {source === "CATEGORY" && (
                <label>
                  Category
                  <select
                    className="admin-input"
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                  >
                    <option value="">Select category</option>
                    {context.categories.map((c: any) => (
                      <option key={c.id} value={c.id}>
                        {labelFor(c)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {source === "ITEM" && (
                <label>
                  Dish
                  <select
                    className="admin-input"
                    value={itemId}
                    onChange={(e) => setItemId(e.target.value)}
                  >
                    <option value="">Select dish</option>
                    {context.items.map((i: any) => (
                      <option key={i.id} value={i.id}>
                        {labelFor(i)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {source !== "MANUAL" && (
                <label>
                  Language
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
              )}
              {template && (
                <div className="legacy-signage-admin">
                  <BannerForm
                    key={`${editing?.id || "new"}-${templateId}-${source}`}
                    fields={
                      source === "MANUAL"
                        ? template.fields
                        : template.fields
                            .filter((f: any) =>
                              ["note", "themeColor"].includes(f.key),
                            )
                            .map((f: any) => ({ ...f, required: false }))
                    }
                    initialData={editing?.rawData || {}}
                    aiRecordId={editing?.id}
                    aiTemplateId={templateId}
                    aiSourceMode={source}
                    assistantRef={assistant}
                    media={context.media}
                    onCancel={() => setEditing(undefined)}
                    onSubmit={async (fd) => {
                      fd.set("templateId", templateId);
                      fd.set("version", String(editing?.version || 0));
                      fd.set("sourceMode", source);
                      fd.set("menuCategoryId", categoryId);
                      fd.set("menuItemId", itemId);
                      fd.set("sourceLocale", locale);
                      await save(fd);
                    }}
                  />
                </div>
              )}
            </div>
          )}
          {kind === "slides" && (
            <form
              className="content-form"
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await save({
                    name,
                    speedMs: speed,
                    effect,
                    bannerIds: selected,
                    version: editing?.version,
                  });
                } catch {}
              }}
            >
              <AiAssistant
                ref={assistant}
                scope="slides"
                recordId={editing?.id}
                initialLocale={locale}
                getValues={() => ({
                  name,
                  speedMs: speed,
                  effect,
                  bannerIds: selected,
                })}
                setField={(key, value) => {
                  if (key === "name") setName(value);
                  if (key === "speedMs") setSpeed(value);
                  if (key === "effect") setEffect(value);
                  if (key === "bannerIds") setSelected(value);
                }}
              />
              <label>
                Name
                <input
                  className="admin-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </label>
              <label>
                Seconds per banner
                <input
                  className="admin-input"
                  type="number"
                  min={1.5}
                  max={3600}
                  step={0.5}
                  value={speed / 1000}
                  onChange={(e) => setSpeed(Number(e.target.value) * 1000)}
                />
              </label>
              <label>
                Transition
                <select
                  className="admin-input"
                  value={effect}
                  onChange={(e) => setEffect(e.target.value)}
                >
                  <option value="FADE">Fade</option>
                  <option value="SLIDE">Slide</option>
                </select>
              </label>
              <h2>Playlist order</h2>
              {selected.map((id, index) => {
                const banner = banners?.banners?.find((b: any) => b.id === id);
                return (
                  <div className="inline-fields" key={`${id}-${index}`}>
                    <span>
                      {index + 1}. {banner?.template?.name || "Missing banner"}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={!index}
                      onClick={() => {
                        const list = [...selected];
                        [list[index - 1], list[index]] = [
                          list[index],
                          list[index - 1],
                        ];
                        setSelected(list);
                      }}
                    >
                      Move up
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={index === selected.length - 1}
                      onClick={() => {
                        const list = [...selected];
                        [list[index + 1], list[index]] = [
                          list[index],
                          list[index + 1],
                        ];
                        setSelected(list);
                      }}
                    >
                      Move down
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() =>
                        setSelected(selected.filter((_, i) => i !== index))
                      }
                    >
                      Remove
                    </Button>
                  </div>
                );
              })}
              <label>
                Add a banner
                <select
                  className="admin-input"
                  value=""
                  onChange={(e) =>
                    e.target.value && setSelected([...selected, e.target.value])
                  }
                >
                  <option value="">Choose banner</option>
                  {banners?.banners?.map((b: any) => (
                    <option key={b.id} value={b.id}>
                      {b.template.name} · {b.rawData?.title || b.status}
                    </option>
                  ))}
                </select>
              </label>
              <Button disabled={busy}>Save draft</Button>
            </form>
          )}
          {kind === "templates" && (
            <form
              className="content-form"
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await save({ name, fields });
                } catch {}
              }}
            >
              <AiAssistant
                ref={assistant}
                scope="templates"
                initialLocale={locale}
                getValues={() => ({ name, fields })}
                setField={(key, value) => {
                  if (key === "name") setName(value);
                  if (key === "fields") setFields(value);
                }}
              />
              <label>
                Template name
                <input
                  className="admin-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </label>
              <p className="muted">
                Custom templates use the generic display layout. Existing
                designed templates remain available when creating banners.
              </p>
              {fields.map((f, index) => (
                <div className="variant-card" key={index}>
                  <label>
                    Field label
                    <input
                      className="admin-input"
                      value={f.label}
                      onChange={(e) =>
                        setFields(
                          fields.map((v, i) =>
                            i === index
                              ? {
                                  ...v,
                                  label: e.target.value,
                                  key: (
                                    slugify(e.target.value) ||
                                    `field-${index + 1}`
                                  ).replaceAll("-", "_"),
                                }
                              : v,
                          ),
                        )
                      }
                      required
                    />
                  </label>
                  <label>
                    Type
                    <select
                      className="admin-input"
                      value={f.type}
                      onChange={(e) =>
                        setFields(
                          fields.map((v, i) =>
                            i === index ? { ...v, type: e.target.value } : v,
                          ),
                        )
                      }
                    >
                      {[
                        "TEXT",
                        "NUMBER",
                        "IMAGE",
                        "RICHTEXT",
                        "BOOLEAN",
                        "COLOR",
                        "SELECT",
                      ].map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </label>
                  {f.type === "SELECT" && (
                    <label>
                      Choices (comma-separated)
                      <input
                        className="admin-input"
                        value={(f.config?.options ?? []).join(", ")}
                        onChange={(e) =>
                          setFields(
                            fields.map((v, i) =>
                              i === index
                                ? {
                                    ...v,
                                    config: {
                                      options: e.target.value
                                        .split(",")
                                        .map((s) => s.trim())
                                        .filter(Boolean),
                                    },
                                  }
                                : v,
                            ),
                          )
                        }
                      />
                    </label>
                  )}
                  <label className="admin-check">
                    <input
                      type="checkbox"
                      checked={f.required}
                      onChange={(e) =>
                        setFields(
                          fields.map((v, i) =>
                            i === index
                              ? { ...v, required: e.target.checked }
                              : v,
                          ),
                        )
                      }
                    />
                    Required
                  </label>
                  <label className="admin-check">
                    <input
                      type="checkbox"
                      checked={f.isArray}
                      onChange={(e) =>
                        setFields(
                          fields.map((v, i) =>
                            i === index
                              ? { ...v, isArray: e.target.checked }
                              : v,
                          ),
                        )
                      }
                    />
                    List of values
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() =>
                      setFields(fields.filter((_, i) => i !== index))
                    }
                  >
                    Remove field
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setFields([
                    ...fields,
                    {
                      key: `field_${fields.length + 1}`,
                      label: "New field",
                      type: "TEXT",
                      required: false,
                      isArray: false,
                    },
                  ])
                }
              >
                Add field
              </Button>
              <Button disabled={busy}>Create template</Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
