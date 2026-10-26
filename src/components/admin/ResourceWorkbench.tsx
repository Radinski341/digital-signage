"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import Link from "next/link";
import { schemas, Resource } from "@/modules/cms";
import { dictionaryDefaults } from "@/modules/localization";
import { localize, slugify } from "@/modules/security";
import { PageHeader } from "./PageHeader";
import { DataTable } from "./DataTable";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { MediaPicker } from "./MediaPicker";
import PageBuilder from "./PageBuilder";
import RichTextEditor from "./RichTextEditor";
import { richDocumentText, textToRichDocument } from "@/modules/rich-text";
import HoursEditor from "./HoursEditor";
import { AiAssistant, type AiAssistantHandle } from "./AiAssistant";
type Field = {
  key: string;
  label: string;
  type?: string;
  options?: string[];
  source?: string;
  hint?: string;
};
export const areas: Record<
  Resource,
  {
    title: string;
    singular: string;
    description: string;
    fields: Field[];
    translated?: string[];
  }
> = {
  profile: {
    title: "Restaurant information",
    singular: "restaurant information",
    description:
      "One source for the details shown across your website and connected displays.",
    fields: [
      { key: "legalName", label: "Legal name" },
      { key: "phone", label: "Phone" },
      { key: "email", label: "Email", type: "email" },
      { key: "website", label: "Website URL", type: "url" },
      {
        key: "domain",
        label: "Public website origin",
        type: "url",
        hint: "For example https://restaurant.example. Used for canonical URLs.",
      },
      {
        key: "currency",
        label: "Currency",
        type: "select",
        options: Intl.supportedValuesOf("currency"),
      },
      {
        key: "timeZone",
        label: "Restaurant time zone",
        type: "select",
        options: Intl.supportedValuesOf("timeZone"),
      },
      {
        key: "priceRange",
        label: "Price range",
        hint: "Only enter factual information, such as €€.",
      },
    ],
    translated: ["name", "summary", "description"],
  },
  branding: {
    title: "Branding",
    singular: "branding",
    description:
      "Customize the public theme. Text colors must maintain readable contrast.",
    fields: [
      ...[
        "primaryColor",
        "accentColor",
        "textColor",
        "backgroundColor",
        "surfaceColor",
      ].map((key) => ({
        key,
        label: key.replace("Color", " color").replace(/([A-Z])/g, " $1"),
        type: "color",
      })),
      {
        key: "headingFont",
        label: "Heading font",
        type: "select",
        options: ["montserrat", "serif", "system"],
      },
      {
        key: "bodyFont",
        label: "Body font",
        type: "select",
        options: ["montserrat", "system", "serif"],
      },
      { key: "radius", label: "Corner radius", type: "number" },
      ...["logoId", "alternativeLogoId", "faviconId", "socialImageId"].map(
        (key) => ({
          key,
          label: key.replace("Id", "").replace(/([A-Z])/g, " $1"),
          type: "image",
        }),
      ),
    ],
  },
  locations: {
    title: "Locations & opening hours",
    singular: "location",
    description:
      "Manage addresses, service hours, holidays and temporary exceptions.",
    fields: [
      { key: "name", label: "Location name" },
      { key: "address", label: "Street address" },
      { key: "city", label: "City" },
      { key: "postalCode", label: "Postal code" },
      {
        key: "country",
        label: "Country code",
        hint: "Two-letter code, for example BG.",
      },
      { key: "phone", label: "Location phone" },
      { key: "email", label: "Location email", type: "email" },
      { key: "directionsUrl", label: "Directions link", type: "url" },
      { key: "latitude", label: "Latitude", type: "decimal" },
      { key: "longitude", label: "Longitude", type: "decimal" },
      { key: "position", label: "Display order", type: "number" },
    ],
  },
  categories: {
    title: "Menu categories",
    singular: "category",
    description: "Group dishes and control their order on the menu.",
    fields: [
      {
        key: "slug",
        label: "URL identifier",
        hint: "Optional; generated from the default-language name when saved.",
      },
      { key: "position", label: "Display order", type: "number" },
      { key: "enabled", label: "Show this category", type: "checkbox" },
      { key: "imageId", label: "Category photograph", type: "image" },
    ],
    translated: ["name", "description"],
  },
  items: {
    title: "Restaurant menu",
    singular: "dish",
    description:
      "Publish dishes, update prices and mark temporary availability.",
    fields: [
      {
        key: "categoryId",
        label: "Category",
        type: "reference",
        source: "categories",
      },
      {
        key: "slug",
        label: "URL identifier",
        hint: "Optional; generated from the default-language name when saved.",
      },
      {
        key: "price",
        label: "Price",
        hint: "Enter the amount using a decimal point.",
      },
      {
        key: "currency",
        label: "Currency",
        type: "select",
        options: Intl.supportedValuesOf("currency"),
      },
      {
        key: "status",
        label: "Publication",
        type: "select",
        options: ["DRAFT", "PUBLISHED", "ARCHIVED"],
      },
      { key: "available", label: "Available to order", type: "checkbox" },
      { key: "featured", label: "Feature on website", type: "checkbox" },
      { key: "position", label: "Display order", type: "number" },
      { key: "imageId", label: "Dish photograph", type: "image" },
      {
        key: "actionId",
        label: "Ordering action",
        type: "reference",
        source: "actions",
      },
      {
        key: "tagIds",
        label: "Dietary indicators & allergens",
        type: "multiple",
        source: "tags",
      },
      {
        key: "imageIds",
        label: "Additional photographs",
        type: "multiple",
        source: "media",
      },
    ],
    translated: [
      "name",
      "description",
      "details",
      "seoTitle",
      "seoDescription",
    ],
  },
  tags: {
    title: "Dietary indicators & allergens",
    singular: "indicator",
    description:
      "Use consistent, translated dietary and allergen labels across dishes.",
    fields: [
      { key: "key", label: "Identifier" },
      {
        key: "kind",
        label: "Type",
        type: "select",
        options: ["DIETARY", "ALLERGEN"],
      },
    ],
    translated: ["name"],
  },
  locales: {
    title: "Languages",
    singular: "language",
    description:
      "Enable public languages and manually translate interface phrases.",
    fields: [
      {
        key: "code",
        label: "Language code",
        hint: "Canonical language code, for example en, bg or ar.",
      },
      { key: "label", label: "Language name" },
      { key: "enabled", label: "Enable this language", type: "checkbox" },
      {
        key: "direction",
        label: "Text direction",
        type: "select",
        options: ["ltr", "rtl"],
      },
      { key: "isDefault", label: "Use as default language", type: "checkbox" },
    ],
  },
  integrations: {
    title: "Ordering integrations",
    singular: "ordering provider",
    description:
      "Configure external ordering links. No ordering API credentials are needed.",
    fields: [
      { key: "provider", label: "Provider", hint: "For example Wolt." },
      { key: "label", label: "Display name" },
      { key: "url", label: "Restaurant/store URL", type: "url" },
      { key: "enabled", label: "Enable this provider", type: "checkbox" },
      { key: "logoId", label: "Provider logo", type: "image" },
    ],
  },
  actions: {
    title: "Buttons & actions",
    singular: "button",
    description:
      "Create reusable actions for pages, calls, directions and ordering.",
    fields: [
      { key: "name", label: "Internal name" },
      {
        key: "type",
        label: "Action",
        type: "select",
        options: [
          "PAGE",
          "EXTERNAL",
          "PHONE",
          "EMAIL",
          "DIRECTIONS",
          "ORDERING",
        ],
      },
      {
        key: "destination",
        label: "Destination",
        hint: "Leave phone, email or directions blank to use restaurant details.",
      },
      {
        key: "pageId",
        label: "Target page",
        type: "reference",
        source: "pages",
      },
      {
        key: "integrationId",
        label: "Ordering provider",
        type: "reference",
        source: "integrations",
      },
      {
        key: "style",
        label: "Appearance",
        type: "select",
        options: ["primary", "secondary", "text"],
      },
      {
        key: "icon",
        label: "Icon",
        type: "select",
        options: ["none", "phone", "map", "order", "arrow"],
      },
      { key: "enabled", label: "Enable this action", type: "checkbox" },
      { key: "newTab", label: "Open in a new tab", type: "checkbox" },
    ],
    translated: ["label"],
  },
  pages: {
    title: "Website pages",
    singular: "page",
    description:
      "Save drafts, preview privately, then publish when everything is ready.",
    fields: [
      { key: "internalName", label: "Internal page name" },
      {
        key: "type",
        label: "Page type",
        type: "select",
        options: ["HOME", "MENU", "ABOUT", "CONTACT", "CUSTOM"],
      },
    ],
    translated: [
      "title",
      "slug",
      "seoTitle",
      "seoDescription",
      "canonicalUrl",
      "ogTitle",
      "ogDescription",
    ],
  },
  navigation: {
    title: "Navigation",
    singular: "navigation menu",
    description:
      "Manage header and footer destinations without copying page URLs.",
    fields: [
      {
        key: "key",
        label: "Menu location",
        type: "select",
        options: ["header", "footer", "footer-info"],
        hint: "Header navigation, footer company links, or footer information links.",
      },
    ],
  },
  users: {
    title: "Users & permissions",
    singular: "user",
    description:
      "Owners manage staff access. Membership changes revoke existing sessions.",
    fields: [
      { key: "email", label: "Email", type: "email" },
      {
        key: "role",
        label: "Role",
        type: "select",
        options: ["OWNER", "ADMIN", "EDITOR"],
      },
      { key: "disabled", label: "Disable sign-in", type: "checkbox" },
      {
        key: "password",
        label: "New password",
        type: "password",
        hint: "At least 12 characters; leave empty to keep an existing password.",
      },
    ],
  },
};
function defaults(resource: Resource, row: any, ctx: any) {
  const base: any = {
    name: "",
    slug: "",
    key: "",
    type: "CUSTOM",
    enabled: true,
    available: true,
    featured: false,
    position: 0,
    price: "",
    currency: ctx.site.currency || "",
    timeZone: ctx.site.timeZone || "",
    domain: ctx.site.domain || "",
    status: "DRAFT",
    categoryId: "",
    direction: "ltr",
    isDefault: false,
    strings: [],
    translations: [],
    variants: [],
    tagIds: [],
    imageIds: [],
    hours: [],
    exceptions: [],
    socials: [],
    cuisines: [],
    sections: [],
    items: [],
    style: "primary",
    icon: "none",
    newTab: false,
    role: "EDITOR",
    disabled: false,
  };
  if (resource === "actions") base.type = "PAGE";
  if (resource === "tags") base.kind = "DIETARY";
  if (resource === "navigation") base.key = "header";
  Object.assign(base, row ?? {});
  if (resource === "profile") {
    base.name = ctx.site.name;
    base.currency = ctx.site.currency || "";
    base.timeZone = ctx.site.timeZone || "";
    base.domain = ctx.site.domain || "";
  }
  for (const key of ["latitude", "longitude"])
    if (base[key] !== undefined && base[key] !== null && base[key] !== "")
      base[key] = Number(base[key]);
  if (resource === "locales")
    base.isDefault = base.code === ctx.site.defaultLocale;
  if (resource === "users" && row?.user) {
    base.email = row.user.email;
    base.disabled = row.disabled || row.user.disabled;
  }
  if (resource === "items") {
    base.price = String(base.price);
    base.tagIds = row?.tags?.map((t: any) => t.tagId) || row?.tagIds || [];
    base.imageIds =
      row?.images?.map((i: any) => i.mediaId) || row?.imageIds || [];
  }
  if (
    areas[resource].translated &&
    !base.translations.some((t: any) => t.locale === ctx.site.defaultLocale)
  )
    base.translations.unshift({ locale: ctx.site.defaultLocale });
  for (const translation of base.translations)
    for (const key of areas[resource].translated ?? []) translation[key] ??= "";
  if (resource === "items")
    for (const translation of base.translations)
      translation.detailsDocument ??= textToRichDocument(translation.details);
  for (const f of areas[resource].fields) {
    if (f.type === "checkbox") base[f.key] ??= false;
    else if (f.type === "image" || f.type === "reference") base[f.key] ??= null;
    else if (f.type === "multiple") base[f.key] ??= [];
    else if (f.type !== "decimal") base[f.key] ??= "";
  }
  return base;
}
async function send(url: string, body: any, method = "POST") {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Unable to save.");
  return data;
}
export function ContentForm({
  resource,
  row,
  context,
  onSaved,
  onDirty,
  draftSave,
}: {
  resource: Resource;
  row: any;
  context: any;
  onSaved: () => void;
  onDirty: (dirty: boolean) => void;
  draftSave?: (value: any) => Promise<void>;
}) {
  const metadata = areas[resource];
  const [locale, setLocale] = useState(context.site.defaultLocale);
  const [translationOpen, setTranslationOpen] = useState(false);
  const assistant = useRef<AiAssistantHandle>(null);
  const [aiConversationId, setAiConversationId] = useState("");
  const form = useForm<any>({
    resolver: (values: any, ctx: any, options: any) => {
      const clean = structuredClone(values);
      if (["items", "categories"].includes(resource) && !clean.slug) {
        const title =
          clean.translations?.find(
            (t: any) => t.locale === context.site.defaultLocale,
          )?.name || "";
        clean.slug =
          slugify(title) || resource + "-" + crypto.randomUUID().slice(0, 8);
      }
      if (clean.password === "") delete clean.password;
      if (clean.translations)
        clean.translations = clean.translations.filter(
          (t: any) =>
            t.locale === context.site.defaultLocale ||
            Boolean(t.name || t.title || t.label),
        );
      if (resource === "locales")
        clean.strings = clean.strings.filter((s: any) => s.value.trim());
      return (zodResolver(schemas[resource] as any) as any)(
        clean,
        ctx,
        options,
      );
    },
    defaultValues: defaults(resource, row, context),
  });
  const {
    register,
    control,
    watch,
    setValue,
    handleSubmit,
    formState: { errors, isDirty, isSubmitting },
  } = form;
  const values = watch();
  const translationIndex = (values.translations ?? []).findIndex(
    (t: any) => t.locale === locale,
  );
  useEffect(() => {
    onDirty(isDirty);
    const unload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    const navigate = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest("a");
      if (
        isDirty &&
        a?.href &&
        !a.target &&
        !window.confirm("Leave without saving your changes?")
      )
        e.preventDefault();
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", navigate, true);
    return () => {
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", navigate, true);
    };
  }, [isDirty, onDirty]);
  const labelFor = (r: any) =>
    (
      localize(
        r.translations ?? [],
        context.site.defaultLocale,
        context.site.defaultLocale,
      ) as any
    )?.name ||
    r.internalName ||
    r.label ||
    r.name ||
    r.alt ||
    r.caption ||
    r.key ||
    "Untitled";
  function setLocaleForEditor(code: string) {
    if (!(values.translations ?? []).some((t: any) => t.locale === code))
      setValue(
        "translations",
        [
          ...(values.translations ?? []),
          {
            locale: code,
            ...Object.fromEntries(
              (metadata.translated ?? []).map((k) => [k, ""]),
            ),
          },
        ],
        { shouldDirty: true },
      );
    setLocale(code);
  }
  function errorAt(path: string) {
    return path.split(".").reduce((v: any, key) => v?.[key], errors as any)
      ?.message;
  }
  const field = (f: Field, path = f.key) => {
    if (draftSave && resource === "items" && f.key === "status") return null;
    if (resource === "actions" && f.key === "pageId" && values.type !== "PAGE")
      return null;
    if (
      resource === "actions" &&
      f.key === "integrationId" &&
      values.type !== "ORDERING"
    )
      return null;
    if (f.type === "image")
      return (
        <Controller
          key={path}
          name={path}
          control={control}
          render={({ field }) => (
            <MediaPicker
              media={context.media}
              label={f.label}
              value={field.value}
              onChange={(id) => field.onChange(id)}
            />
          )}
        />
      );
    const common = {
      ...register(
        path,
        f.type === "number"
          ? { valueAsNumber: true }
          : f.type === "decimal"
            ? { setValueAs: (v) => (v === "" ? null : Number(v)) }
            : {},
      ),
      id: path,
      ...(f.type !== "checkbox" ? { "aria-labelledby": path + "-label" } : {}),
      "aria-invalid": Boolean(errorAt(path)),
    };
    return (
      <label
        key={path}
        className={`admin-form-field ${f.type === "checkbox" ? "admin-check" : ""}`}
        htmlFor={path}
      >
        {f.type === "checkbox" ? (
          <>
            <input {...common} type="checkbox" />
            {f.label}
          </>
        ) : (
          <>
            <span id={path + "-label"}>{f.label}</span>
            {f.type === "select" ? (
              <select {...common} className="admin-input">
                <option value="">Choose…</option>
                {f.options?.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            ) : f.type === "reference" || f.type === "multiple" ? (
              <select
                {...common}
                className="admin-input"
                multiple={f.type === "multiple"}
              >
                <option value="" disabled={f.type === "multiple"}>
                  {f.type === "reference"
                    ? "None selected"
                    : "Choose one or more"}
                </option>
                {(context[f.source!] ?? []).map((r: any) => (
                  <option key={r.id} value={r.id}>
                    {labelFor(r)}
                  </option>
                ))}
              </select>
            ) : [
                "description",
                "details",
                "summary",
                "seoDescription",
              ].includes(f.key) ? (
              <textarea
                {...common}
                className="admin-input"
                rows={resource === "items" && f.key === "details" ? 8 : 3}
              />
            ) : (
              <input
                {...common}
                className="admin-input"
                type={f.type === "decimal" ? "number" : f.type || "text"}
                readOnly={
                  resource === "users" && Boolean(row?.id) && f.key === "email"
                }
                step={f.type === "decimal" ? "any" : undefined}
              />
            )}
            {f.hint && <small>{f.hint}</small>}
          </>
        )}
        {errorAt(path) && (
          <span role="alert" className="field-error">
            {String(errorAt(path))}
          </span>
        )}
      </label>
    );
  };
  function localizedFields() {
    return translationIndex >= 0 ? (
      <div className="form-grid">
        {metadata.translated?.map((key) =>
          resource === "items" && key === "details" ? (
            <div
              className="admin-form-field col-span-full"
              key={`description-${translationIndex}`}
            >
              <span>Detailed dish description</span>
              <Controller
                control={control}
                name={`translations.${translationIndex}.detailsDocument`}
                render={({ field: richField }) => (
                  <RichTextEditor
                    key={translationIndex}
                    label="Dish description"
                    value={richField.value}
                    media={context.media || []}
                    onChange={(document) => {
                      richField.onChange(document);
                      setValue(
                        `translations.${translationIndex}.details`,
                        richDocumentText(document),
                        { shouldDirty: true },
                      );
                    }}
                  />
                )}
              />
              <small>
                Use headings, paragraphs and lists to tell the story of the
                dish. Add confirmed ingredient and serving details.
              </small>
              {errorAt(`translations.${translationIndex}.detailsDocument`) && (
                <span role="alert" className="field-error">
                  {String(
                    errorAt(`translations.${translationIndex}.detailsDocument`),
                  )}
                </span>
              )}
            </div>
          ) : (
            field(
              {
                key,
                label:
                  (
                    {
                      ...(resource === "items"
                        ? { details: "Detailed dish description" }
                        : {}),
                      seoTitle: "SEO title",
                      seoDescription: "Meta description",
                      canonicalUrl: "Canonical URL",
                      ogTitle: "Social title",
                      ogDescription: "Social description",
                      slug: "URL slug (empty for Home)",
                    } as any
                  )[key] || key.charAt(0).toUpperCase() + key.slice(1),
              },
              `translations.${translationIndex}.${key}`,
            )
          ),
        )}
        {resource === "pages" && (
          <>
            <label className="admin-check">
              <input
                type="checkbox"
                {...register(`translations.${translationIndex}.noIndex`)}
              />
              Exclude this language’s page from search results
            </label>
            <Controller
              control={control}
              name={`translations.${translationIndex}.socialImageId`}
              render={({ field }) => (
                <MediaPicker
                  media={context.media}
                  label="Social sharing image"
                  value={field.value}
                  onChange={field.onChange}
                />
              )}
            />
          </>
        )}
      </div>
    ) : null;
  }
  return (
    <form
      className="content-form"
      onSubmit={
        draftSave
          ? async (event) => {
              event.preventDefault();
              try {
                await draftSave(form.getValues());
                form.reset(form.getValues());
                onSaved();
              } catch (e) {
                toast.error(
                  e instanceof Error ? e.message : "Unable to save proposal.",
                );
              }
            }
          : handleSubmit(
              async (raw) => {
                try {
                  const data = structuredClone(raw);
                  if (data.password === "") delete data.password;
                  if (data.translations)
                    data.translations = data.translations.filter(
                      (t: any) =>
                        t.locale === context.site.defaultLocale ||
                        Boolean(t.name || t.title || t.label),
                    );
                  if (resource === "locales")
                    data.strings = data.strings.filter((s: any) =>
                      s.value.trim(),
                    );
                  for (const f of metadata.fields)
                    if (f.type === "reference" && !data[f.key])
                      data[f.key] = null;
                  const saved = await send(
                    `/api/cms/${resource}${row?.id ? "/" + row.id : ""}`,
                    data,
                    row?.id ? "PUT" : "POST",
                  );
                  await assistant.current?.attach(saved.id);
                  toast.success(
                    resource === "pages"
                      ? "Draft saved. Publish it when ready."
                      : "Changes saved.",
                  );
                  form.reset(data);
                  onSaved();
                } catch (e) {
                  toast.error(
                    e instanceof Error ? e.message : "Unable to save.",
                  );
                }
              },
              () =>
                toast.error(
                  "Please check the form fields. Required content may be missing.",
                ),
            )
      }
    >
      {resource !== "users" && !draftSave && (
        <AiAssistant
          ref={assistant}
          scope={resource}
          recordId={row?.id}
          conversationId={aiConversationId}
          onConversation={setAiConversationId}
          initialLocale={locale}
          getValues={() => form.getValues()}
          setField={(key, value) =>
            setValue(key, value, { shouldDirty: true, shouldValidate: true })
          }
        />
      )}
      <div className="ai-editor-fields">
        {metadata.translated && (
          <section className="form-section">
            <div className="form-section-heading">
              <h2>
                Content ·{" "}
                {context.locales.find((l: any) => l.code === locale)?.label ||
                  locale}
              </h2>
              <Button
                type="button"
                variant="outline"
                onClick={() => setTranslationOpen(true)}
              >
                Translations
              </Button>
            </div>
            {localizedFields()}
            <Dialog open={translationOpen} onOpenChange={setTranslationOpen}>
              <DialogContent>
                <DialogTitle className="dialog-title">
                  Manage translations
                </DialogTitle>
                <DialogDescription>
                  Choose a language. Empty translations fall back to the default
                  language after review.
                </DialogDescription>
                <div className="language-list">
                  {context.locales.map((l: any) => {
                    const t = values.translations?.find(
                      (t: any) => t.locale === l.code,
                    );
                    const complete = Boolean(t?.name || t?.title || t?.label);
                    return (
                      <Button
                        type="button"
                        variant="outline"
                        key={l.code}
                        onClick={() => {
                          setLocaleForEditor(l.code);
                          setTranslationOpen(false);
                        }}
                      >
                        {l.label} ·{" "}
                        {complete ? "Content added" : "Missing translation"}
                      </Button>
                    );
                  })}
                </div>
                <label className="admin-form-field">
                  <span>
                    {draftSave ? "Editing language" : "AI translation language"}
                  </span>
                  <select
                    className="admin-input"
                    value={locale}
                    onChange={(e) => setLocaleForEditor(e.target.value)}
                  >
                    {context.locales.map((language: any) => (
                      <option key={language.code} value={language.code}>
                        {language.label}
                      </option>
                    ))}
                  </select>
                </label>
                {resource !== "users" && !draftSave && (
                  <AiAssistant
                    key={locale}
                    scope={resource}
                    recordId={row?.id}
                    conversationId={aiConversationId}
                    onConversation={setAiConversationId}
                    onlyLocale={locale}
                    translationOnly
                    retainDraft
                    getValues={() => form.getValues()}
                    setField={(key, value) =>
                      setValue(key, value, {
                        shouldDirty: true,
                        shouldValidate: true,
                      })
                    }
                  />
                )}
              </DialogContent>
            </Dialog>
          </section>
        )}
        <div className="form-grid">{metadata.fields.map((f) => field(f))}</div>
        {resource === "locations" && (
          <HoursEditor
            value={values.hours ?? []}
            onChange={(v) => setValue("hours", v, { shouldDirty: true })}
            exceptions={values.exceptions ?? []}
            onExceptions={(v) =>
              setValue("exceptions", v, { shouldDirty: true })
            }
          />
        )}
        {resource === "profile" && (
          <section className="form-section">
            <h2>Cuisine & social profiles</h2>
            <label>
              Cuisine types (one per line)
              <textarea
                className="admin-input"
                value={(values.cuisines ?? []).join("\n")}
                onChange={(e) =>
                  setValue("cuisines", e.target.value.split("\n"), {
                    shouldDirty: true,
                  })
                }
              />
            </label>
            {values.socials.map((s: any, index: number) => (
              <div className="inline-fields" key={index}>
                <label>
                  Label
                  <input
                    className="admin-input"
                    {...register(`socials.${index}.label`)}
                  />
                </label>
                <label>
                  URL
                  <input
                    className="admin-input"
                    type="url"
                    {...register(`socials.${index}.url`)}
                  />
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    setValue(
                      "socials",
                      values.socials.filter((_: any, i: number) => i !== index),
                      { shouldDirty: true },
                    )
                  }
                >
                  Remove
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setValue(
                  "socials",
                  [...values.socials, { label: "", url: "" }],
                  {
                    shouldDirty: true,
                  },
                )
              }
            >
              Add social profile
            </Button>
          </section>
        )}
        {resource === "items" && (
          <section className="form-section">
            <h2>Portions & variants</h2>
            {values.variants.map((variant: any, index: number) => (
              <div key={index} className="variant-card">
                {context.locales.map((l: any) => {
                  const ti = variant.translations.findIndex(
                    (t: any) => t.locale === l.code,
                  );
                  if (ti < 0)
                    return (
                      <Button
                        key={l.code}
                        type="button"
                        variant="ghost"
                        onClick={() =>
                          setValue(
                            `variants.${index}.translations`,
                            [
                              ...variant.translations,
                              { locale: l.code, name: "" },
                            ],
                            { shouldDirty: true },
                          )
                        }
                      >
                        Translate to {l.label}
                      </Button>
                    );
                  return (
                    <label key={l.code}>
                      Name · {l.label}
                      <input
                        className="admin-input"
                        {...register(
                          `variants.${index}.translations.${ti}.name`,
                        )}
                      />
                    </label>
                  );
                })}
                <label>
                  Price
                  <input
                    className="admin-input"
                    {...register(`variants.${index}.price`)}
                  />
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    setValue(
                      "variants",
                      values.variants.filter(
                        (_: any, i: number) => i !== index,
                      ),
                      { shouldDirty: true },
                    )
                  }
                >
                  Remove variant
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setValue(
                  "variants",
                  [
                    ...values.variants,
                    {
                      price: "",
                      translations: [
                        { locale: context.site.defaultLocale, name: "" },
                      ],
                    },
                  ],
                  { shouldDirty: true },
                )
              }
            >
              Add variant
            </Button>
          </section>
        )}
        {resource === "pages" && (
          <div className="admin-notice">
            <strong>Publication checks</strong>
            <ul>
              {values.translations
                ?.filter((t: any) => t.title)
                .map((t: any) => (
                  <li key={t.locale}>
                    {t.locale}:{" "}
                    {!t.seoDescription
                      ? "Add a meta description for search results."
                      : "Meta description configured."}
                    {!t.seoTitle
                      ? " The page title will be used as the SEO default."
                      : ""}
                  </li>
                ))}
              <li>
                Review image alt text, translated section content and button
                destinations in Preview before publishing.
              </li>
            </ul>
          </div>
        )}
        {resource === "pages" && (
          <PageBuilder
            sections={values.sections ?? []}
            context={context}
            onChange={(v) => setValue("sections", v, { shouldDirty: true })}
          />
        )}
        {resource === "navigation" && (
          <section className="form-section">
            <h2>Navigation links</h2>
            {values.items.map((item: any, index: number) => (
              <div key={index} className="navigation-item-editor">
                {context.locales.map((l: any) => {
                  const ti = item.translations.findIndex(
                    (t: any) => t.locale === l.code,
                  );
                  return ti >= 0 ? (
                    <label key={l.code}>
                      Label · {l.label}
                      <input
                        className="admin-input"
                        {...register(`items.${index}.translations.${ti}.label`)}
                      />
                    </label>
                  ) : (
                    <Button
                      key={l.code}
                      type="button"
                      variant="ghost"
                      onClick={() =>
                        setValue(
                          `items.${index}.translations`,
                          [...item.translations, { locale: l.code, label: "" }],
                          { shouldDirty: true },
                        )
                      }
                    >
                      Translate to {l.label}
                    </Button>
                  );
                })}
                <label>
                  Internal page
                  <select
                    className="admin-input"
                    {...register(`items.${index}.pageId`)}
                  >
                    <option value="">External link</option>
                    {context.pages.map((p: any) => (
                      <option key={p.id} value={p.id}>
                        {p.internalName}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  External URL
                  <input
                    className="admin-input"
                    {...register(`items.${index}.url`)}
                  />
                </label>
                <label>
                  Parent link
                  <select
                    className="admin-input"
                    {...register(`items.${index}.parentId`)}
                  >
                    <option value="">Top level</option>
                    {values.items
                      .filter(
                        (i: any) => i.id !== item.id && !i.parentId && i.id,
                      )
                      .map((i: any) => (
                        <option key={i.id} value={i.id}>
                          {i.translations.find(
                            (t: any) => t.locale === context.site.defaultLocale,
                          )?.label || "Untitled link"}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="admin-check">
                  <input
                    type="checkbox"
                    {...register(`items.${index}.enabled`)}
                  />
                  Visible
                </label>
                <div>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={!index}
                    onClick={() => {
                      const list = [...values.items];
                      [list[index - 1], list[index]] = [
                        list[index],
                        list[index - 1],
                      ];
                      setValue("items", list, { shouldDirty: true });
                    }}
                  >
                    Move up
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={index === values.items.length - 1}
                    onClick={() => {
                      const list = [...values.items];
                      [list[index + 1], list[index]] = [
                        list[index],
                        list[index + 1],
                      ];
                      setValue("items", list, { shouldDirty: true });
                    }}
                  >
                    Move down
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() =>
                      setValue(
                        "items",
                        values.items.filter(
                          (r: any, i: number) =>
                            i !== index && r.parentId !== item.id,
                        ),
                        { shouldDirty: true },
                      )
                    }
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setValue(
                  "items",
                  [
                    ...values.items,
                    {
                      id: crypto.randomUUID(),
                      parentId: null,
                      pageId: null,
                      url: "",
                      enabled: true,
                      translations: [
                        { locale: context.site.defaultLocale, label: "" },
                      ],
                    },
                  ],
                  { shouldDirty: true },
                )
              }
            >
              Add link
            </Button>
          </section>
        )}
        {resource === "locales" && (
          <section className="form-section">
            <h2>Website interface phrases</h2>
            <p>Leave a phrase empty to use the default-language phrase.</p>
            {Object.entries(dictionaryDefaults).map(([key, fallback]) => {
              const index = values.strings.findIndex((s: any) => s.key === key);
              return (
                <label key={key}>
                  {fallback}
                  <input
                    className="admin-input"
                    value={index >= 0 ? values.strings[index].value : ""}
                    placeholder={fallback}
                    onChange={(e) => {
                      const list = values.strings.filter(
                        (s: any) => s.key !== key,
                      );
                      setValue(
                        "strings",
                        [...list, { key, value: e.target.value }],
                        { shouldDirty: true },
                      );
                    }}
                  />
                </label>
              );
            })}
          </section>
        )}
        {Object.keys(errors).length > 0 && (
          <div role="alert" className="admin-error">
            Please check required fields, translations and section content
            before saving.
          </div>
        )}
        <div className="save-bar">
          <span>
            {isDirty
              ? "Unsaved changes"
              : draftSave
                ? "Editing the private proposal"
                : "All changes saved"}
          </span>
          <Button type="submit" disabled={isSubmitting}>
            {draftSave
              ? "Save to proposal"
              : isSubmitting
                ? "Saving…"
                : resource === "pages"
                  ? "Save draft"
                  : resource === "items" && values.status === "PUBLISHED"
                    ? "Save & update live menu"
                    : "Save changes"}
          </Button>
        </div>
      </div>
    </form>
  );
}
export default function ResourceWorkbench({
  resource,
  initialRows,
  context,
}: {
  resource: Resource;
  initialRows: any[];
  context: any;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [editing, setEditing] = useState<any>(undefined);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => setRows(initialRows), [initialRows]);
  const metadata = areas[resource];
  const singleton = ["profile", "branding"].includes(resource);
  const label = (row: any) =>
    row.internalName ||
    row.name ||
    row.label ||
    row.user?.email ||
    (
      localize(
        row.translations ?? [],
        context.site.defaultLocale,
        context.site.defaultLocale,
      ) as any
    )?.name ||
    row.key ||
    row.code ||
    "Untitled";
  async function refresh() {
    const response = await fetch(`/api/cms/${resource}`);
    const result = await response.json();
    if (response.ok) setRows(result.rows);
    router.refresh();
  }
  async function publish(row: any, operation: string, revisionId?: string) {
    if (
      ["unpublish", "archive", "restore"].includes(operation) &&
      !window.confirm(
        `${operation.charAt(0).toUpperCase() + operation.slice(1)} this page?`,
      )
    )
      return;
    setBusy(row.id);
    try {
      await send(`/api/pages/${row.id}/publish`, {
        version: row.version,
        locale: context.site.defaultLocale,
        operation,
        revisionId,
      });
      toast.success(
        operation === "duplicate"
          ? "Draft copy created."
          : operation === "restore"
            ? "Revision restored to draft."
            : `Page ${operation} completed.`,
      );
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  function close() {
    if (dirty && !window.confirm("Discard your unsaved changes?")) return;
    setDirty(false);
    setEditing(undefined);
  }
  return (
    <>
      <PageHeader
        title={metadata.title}
        description={metadata.description}
        actions={
          <Button
            onClick={() => {
              setDirty(false);
              setEditing(singleton ? rows[0] || null : null);
            }}
          >
            {singleton ? "Edit settings" : `Add ${metadata.singular}`}
          </Button>
        }
      />
      {resource === "items" && (
        <div className="admin-tabs">
          <Link href="/admin/menu" aria-current="page">
            Dishes
          </Link>
          <Link href="/admin/categories">Categories</Link>
          <Link href="/admin/tags">Dietary & allergens</Link>
        </div>
      )}
      {resource === "pages" && (
        <p className="admin-notice">
          Saving changes keeps the live page intact. Preview a saved draft, then
          publish each language separately.
        </p>
      )}
      <DataTable
        rows={rows}
        empty={`No ${metadata.title.toLowerCase()} yet`}
        columns={[
          {
            id: "name",
            header: "Name",
            accessorFn: label,
            cell: ({ row }: any) => (
              <button
                className="table-name"
                onClick={() => {
                  setDirty(false);
                  setEditing(row.original);
                }}
              >
                {label(row.original)}
              </button>
            ),
          },
          {
            id: "status",
            header: "Status",
            accessorFn: (r: any) =>
              r.status ||
              (r.enabled === false
                ? "Disabled"
                : r.available === false
                  ? "Unavailable"
                  : "Active"),
            cell: ({ row }: any) => (
              <span
                className={`status-badge ${row.original.status === "DRAFT" ? "draft" : ""}`}
              >
                {row.original.status ||
                  (!row.original.enabled && "enabled" in row.original
                    ? "Disabled"
                    : resource === "items" && !row.original.available
                      ? "Unavailable"
                      : "Active")}
              </span>
            ),
          },
          ...(resource === "items"
            ? [
                {
                  id: "price",
                  header: "Price",
                  accessorFn: (r: any) => `${r.price} ${r.currency}`,
                  cell: ({ row }: any) => (
                    <form
                      className="inline-price"
                      key={row.original.id + "-" + row.original.version}
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const price = String(
                          new FormData(e.currentTarget).get("price"),
                        );
                        try {
                          await send(
                            "/api/cms/items/" + row.original.id,
                            {
                              ...defaults("items", row.original, context),
                              price,
                            },
                            "PUT",
                          );
                          toast.success("Live price updated.");
                          await refresh();
                        } catch (error) {
                          toast.error((error as Error).message);
                        }
                      }}
                    >
                      <input
                        name="price"
                        className="admin-input"
                        defaultValue={row.original.price}
                        aria-label={"Price for " + label(row.original)}
                      />
                      <span>{row.original.currency}</span>
                      <Button size="sm" variant="outline">
                        Update price
                      </Button>
                    </form>
                  ),
                },
                {
                  id: "availability",
                  header: "Availability",
                  cell: ({ row }: any) => (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        try {
                          const item = defaults("items", row.original, context);
                          await send(
                            "/api/cms/items/" + row.original.id,
                            { ...item, available: !item.available },
                            "PUT",
                          );
                          toast.success("Availability updated.");
                          await refresh();
                        } catch (e) {
                          toast.error((e as Error).message);
                        }
                      }}
                    >
                      {row.original.available
                        ? "Mark unavailable"
                        : "Mark available"}
                    </Button>
                  ),
                },
              ]
            : []),
          {
            id: "actions",
            header: "Actions",
            cell: ({ row }: any) => (
              <div className="table-actions">
                {["categories", "items"].includes(resource) &&
                  [-1, 1].map((delta) => (
                    <Button
                      key={delta}
                      size="sm"
                      variant="ghost"
                      aria-label={
                        (delta < 0 ? "Move up: " : "Move down: ") +
                        label(row.original)
                      }
                      disabled={
                        rows.findIndex((r) => r.id === row.original.id) +
                          delta <
                          0 ||
                        rows.findIndex((r) => r.id === row.original.id) +
                          delta >=
                          rows.length
                      }
                      onClick={async () => {
                        const list = [...rows],
                          index = list.findIndex(
                            (r) => r.id === row.original.id,
                          );
                        [list[index], list[index + delta]] = [
                          list[index + delta],
                          list[index],
                        ];
                        try {
                          await send(
                            "/api/reorder/" + resource,
                            list.map((r) => ({ id: r.id, version: r.version })),
                          );
                          toast.success("Display order updated.");
                          await refresh();
                        } catch (error) {
                          toast.error((error as Error).message);
                        }
                      }}
                    >
                      {delta < 0 ? "↑" : "↓"}
                    </Button>
                  ))}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setDirty(false);
                    setEditing(row.original);
                  }}
                >
                  Edit
                </Button>
                {resource === "pages" && (
                  <>
                    <a
                      className="admin-link"
                      href={`/admin/preview/${row.original.id}?locale=${context.site.defaultLocale}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Preview ↗
                    </a>
                    <Button
                      size="sm"
                      disabled={busy === row.original.id}
                      onClick={() => publish(row.original, "publish")}
                    >
                      Publish
                    </Button>
                    <details>
                      <summary>More</summary>
                      <div className="table-more">
                        {context.locales.map((l: any) => (
                          <a
                            key={l.code}
                            className="admin-link"
                            href={`/preview/${row.original.id}?locale=${l.code}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Preview · {l.label}
                          </a>
                        ))}
                        <label>
                          Publish language
                          <select
                            className="admin-input"
                            defaultValue=""
                            onChange={async (e) => {
                              if (!e.target.value) return;
                              try {
                                await send(
                                  `/api/pages/${row.original.id}/publish`,
                                  {
                                    version: row.original.version,
                                    locale: e.target.value,
                                    operation: "publish",
                                  },
                                );
                                toast.success("Translation published.");
                                await refresh();
                              } catch (error) {
                                toast.error((error as Error).message);
                              }
                            }}
                          >
                            <option value="">Choose language</option>
                            {context.locales.map((l: any) => (
                              <option key={l.code} value={l.code}>
                                {l.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => publish(row.original, "duplicate")}
                        >
                          Duplicate
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => publish(row.original, "unpublish")}
                        >
                          Unpublish
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => publish(row.original, "archive")}
                        >
                          Archive
                        </Button>
                        {row.original.revisions?.length > 0 && (
                          <label>
                            Restore revision
                            <select
                              className="admin-input"
                              defaultValue=""
                              onChange={(e) =>
                                e.target.value &&
                                publish(row.original, "restore", e.target.value)
                              }
                            >
                              <option value="">Choose revision</option>
                              {row.original.revisions.map((r: any) => (
                                <option key={r.id} value={r.id}>
                                  {r.locale} · v{r.number} ·{" "}
                                  {new Date(r.createdAt).toLocaleDateString()}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                      </div>
                    </details>
                  </>
                )}
              </div>
            ),
          },
        ]}
      />
      <Dialog
        open={editing !== undefined}
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <DialogContent
          className={resource === "pages" ? "max-w-5xl" : "max-w-3xl"}
        >
          <DialogTitle className="dialog-title">
            {editing ? "Edit" : "Add"} {metadata.singular}
          </DialogTitle>
          <DialogDescription>{metadata.description}</DialogDescription>
          {editing !== undefined && (
            <ContentForm
              key={editing?.id || "new"}
              resource={resource}
              row={editing}
              context={context}
              onDirty={setDirty}
              onSaved={() => {
                setDirty(false);
                setEditing(undefined);
                refresh();
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
