"use client";
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import {
  Sparkles,
  ArrowUpRight,
  Check,
  LoaderCircle,
  MessageSquare,
  Eye,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { PageHeader } from "./PageHeader";
import { ContentForm, areas } from "./ResourceWorkbench";
import AiProposalEditor from "./AiProposalEditors";
import {
  activeRunStates,
  labelDraft,
  structurallyEditable,
} from "@/modules/ai/workspace";
import type { Resource } from "@/modules/cms";
async function api(url: string, body?: any) {
  const response = await fetch(
    url,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : { cache: "no-store" },
  );
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || "Unable to complete this request.");
  return result;
}
function Readable({
  value,
  context,
  depth = 0,
}: {
  value: any;
  context: any;
  depth?: number;
}) {
  if (value == null || value === "") return <span>—</span>;
  if (typeof value !== "object") {
    const reference = Object.values(context)
      .filter(Array.isArray)
      .flat()
      .find((r: any) => r?.id === value) as any;
    return (
      <span>
        {reference
          ? reference.name ||
            reference.internalName ||
            reference.translations?.[0]?.name ||
            reference.label ||
            "Selected content"
          : String(value)}
      </span>
    );
  }
  if (depth > 4) return <span>Structured content</span>;
  if (Array.isArray(value))
    return (
      <ul>
        {value.map((v, i) => (
          <li key={i}>
            <Readable value={v} context={context} depth={depth + 1} />
          </li>
        ))}
      </ul>
    );
  return (
    <dl>
      {Object.entries(value)
        .filter(
          ([k]) =>
            !["id", "siteId", "version", "createdAt", "updatedAt"].includes(k),
        )
        .map(([k, v]) => (
          <div key={k}>
            <dt>{k.replace(/([A-Z])/g, " $1")}</dt>
            <dd>
              <Readable value={v} context={context} depth={depth + 1} />
            </dd>
          </div>
        ))}
    </dl>
  );
}
export default function AiWebsiteBuilder({
  defaultLocale,
}: {
  defaultLocale: string;
}) {
  const {
    data: list,
    error: listError,
    mutate: reloadList,
  } = useSWR("/api/ai/workspaces", api);
  const [id, setId] = useState("");
  const [creating, setCreating] = useState(false);
  const { data, error, mutate } = useSWR(
    id ? `/api/ai/workspaces/${id}` : null,
    api,
    {
      refreshInterval: (d: any) =>
        activeRunStates.includes(d?.run?.state) ? 2500 : 0,
      revalidateOnFocus: false,
    },
  );
  const [title, setTitle] = useState("Website content update"),
    [brief, setBrief] = useState(""),
    [locales, setLocales] = useState(defaultLocale),
    [signage, setSignage] = useState(false);
  const [message, setMessage] = useState(""),
    [answers, setAnswers] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(false),
    [editing, setEditing] = useState<any>(null),
    [dirty, setDirty] = useState(false),
    [view, setView] = useState("review");
  const [preview, setPreview] = useState(""),
    [device, setDevice] = useState("desktop");
  const [factReview, setFactReview] = useState<{
    id: string;
    revision: number;
  } | null>(null);
  const [factsConfirmed, setFactsConfirmed] = useState(false);
  const acceptKey = useRef<{ revision: number; key: string } | null>(null);
  const w = data?.workspace,
    running = activeRunStates.includes(data?.run?.state),
    applied = w?.state === "APPLIED";
  const last = data?.messages?.at(-1);
  const questions = last?.role === "assistant" ? last.body.questions || [] : [];
  const errors = (data?.issues || []).filter(
    (i: any) => i.severity === "error" && i.code !== "FACT_REVIEW_REQUIRED",
  );
  const factIssues = (data?.issues || []).filter(
    (i: any) => i.code === "FACT_REVIEW_REQUIRED",
  );
  const factOperations = (w?.operations || []).filter((op: any) =>
    factIssues.some((i: any) => i.key === op.key),
  );
  const reviewCurrent =
    !!factReview && factReview.id === id && factReview.revision === w?.revision;
  useEffect(() => {
    setFactReview(null);
    setFactsConfirmed(false);
  }, [id, w?.revision]);
  useEffect(() => {
    if (!id && list?.rows?.length) setId(list.rows[0].id);
  }, [id, list]);
  useEffect(() => {
    if (w?.state === "NEEDS_INPUT") setView("chat");
  }, [w?.state]);
  useEffect(() => {
    setPreview("");
    setAnswers({});
    setEditing(null);
    acceptKey.current = null;
  }, [id]);
  useEffect(() => {
    const warning = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warning);
    return () => window.removeEventListener("beforeunload", warning);
  }, [dirty]);
  async function action(name: string, body: any) {
    setBusy(true);
    try {
      const result = await api(`/api/ai/workspaces/${id}/${name}`, {
        revision: w.revision,
        ...body,
      });
      await mutate();
      await reloadList();
      return result;
    } catch (e) {
      toast.error((e as Error).message);
      throw e;
    } finally {
      setBusy(false);
    }
  }
  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const created = await api("/api/ai/workspaces", {
        title,
        brief,
        locales: locales
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean),
        includeSignage: signage,
      });
      try {
        await api(`/api/ai/workspaces/${created.id}/message`, {
          revision: created.revision,
          key: crypto.randomUUID(),
          message:
            "Prepare the requested updates to this website. Inspect its existing content and settings, preserve content outside the requested scope, ask for missing facts together, and stage the changes for review.",
        });
      } finally {
        setId(created.id);
        setCreating(false);
        await reloadList();
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function saveDraft(payload: any) {
    await action("stage", {
      key: editing.key,
      resource: editing.resource,
      recordId: editing.targetId,
      payload,
      facts: editing.facts || [],
    });
    setDirty(false);
    setEditing(null);
    toast.success("Proposal updated. The live website is unchanged.");
  }
  async function publish(reviewed?: { id: string; revision: number }) {
    if (reviewed && (reviewed.id !== id || reviewed.revision !== w.revision)) {
      toast.error(
        "The proposal changed. Review the current revision before publishing.",
      );
      return;
    }
    if (!reviewed && factIssues.length) {
      setFactsConfirmed(false);
      setFactReview({ id, revision: w.revision });
      return;
    }
    if (!acceptKey.current || acceptKey.current.revision !== w.revision)
      acceptKey.current = { revision: w.revision, key: crypto.randomUUID() };
    try {
      await action("accept", {
        ...acceptKey.current,
        confirmBusinessFacts: !!reviewed,
      });
      setFactReview(null);
      toast.success("All approved content is published.");
    } catch {
      /* actionable toast from action; retain idempotency key for retry */
    }
  }
  return (
    <>
      <PageHeader
        title="Website Assistant"
        description="Manage this website’s pages, menu, languages and settings. Preview proposed updates before publishing."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Sparkles size={16} />
            New update request
          </Button>
        }
      />
      {(listError || error) && (
        <div role="alert" className="admin-error">
          {(listError || error).message}
          <Button
            variant="outline"
            onClick={() => {
              void reloadList();
              void mutate();
            }}
          >
            Retry
          </Button>
        </div>
      )}
      {list && !list.configured && (
        <p className="admin-notice">
          AI generation needs a server OPENAI_API_KEY. Existing CMS editing
          remains available.
        </p>
      )}
      {list?.rows?.length > 0 && (
        <label className="admin-form-field ai-workspace-select">
          Update history
          <select
            className="admin-input"
            value={id}
            onChange={(e) => setId(e.target.value)}
          >
            {list.rows.map((r: any) => (
              <option key={r.id} value={r.id}>
                {r.title} · {r.state.replaceAll("_", " ").toLowerCase()}
              </option>
            ))}
          </select>
        </label>
      )}
      {!w && !creating && !error && (
        <div className="admin-empty">
          <Sparkles size={32} />
          <h2>Manage your website with a conversation</h2>
          <p>
            Ask for changes to this website’s pages, menu, translations or
            settings. The assistant prepares updates for you to review before
            publishing.
          </p>
          <Button onClick={() => setCreating(true)}>
            Start an update request
          </Button>
        </div>
      )}
      {w && (
        <>
          <div className="ai-builder-toolbar">
            <div>
              <h2>{w.title}</h2>
              <p role="status">
                {running ? (
                  <>
                    <LoaderCircle className="ai-builder-spinner" size={16} />
                    Creating your proposal in the background
                  </>
                ) : applied ? (
                  <>
                    <Check size={16} />
                    Published
                  </>
                ) : w.state === "NEEDS_INPUT" ? (
                  "Your answers are needed"
                ) : (
                  "Private proposal · Ready to review and edit"
                )}
              </p>
            </div>
            <div className="ai-builder-actions">
              {running ? (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void action("cancel", {})
                      .then(() => setView("review"))
                      .catch(() => {})
                  }
                >
                  Pause and review generated content
                </Button>
              ) : (
                !applied && (
                  <Button
                    disabled={
                      busy ||
                      !w.operations.length ||
                      errors.length > 0 ||
                      data.conflicts.length > 0
                    }
                    onClick={() => void publish()}
                  >
                    Accept and publish all
                  </Button>
                )
              )}
            </div>
          </div>
          {!running &&
            !applied &&
            (errors.length > 0 || data.conflicts.length > 0) && (
              <p role="alert" className="admin-error">
                Publishing needs {errors.length} field correction(s) and{" "}
                {data.conflicts.length} conflict resolution(s). Open Review
                content to edit the highlighted records or ask the agent to
                repair them.
              </p>
            )}
          {activeRunStates.includes(data.run?.state) &&
            Date.now() -
              new Date(data.run.heartbeatAt || data.run.createdAt).getTime() >
              30000 && (
              <p role="status" className="admin-notice">
                Waiting for the background worker. Your proposal is safe; ask
                your operator to check the AI worker if this continues.
              </p>
            )}
          {["FAILED", "CANCELLED"].includes(data.run?.state) && (
            <div className="admin-error" role="alert">
              {data.run.error?.includes("reached its generation budget")
                ? data.run.budget &&
                  Object.entries(data.run.budget.limits).every(
                    ([key, limit]) => data.run.budget.used[key] < Number(limit),
                  )
                  ? "A worker stopped this run using older or different budget settings. Your proposal is saved. Restart outdated workers before resuming; you can also review and publish the generated content now."
                  : "This continuation reached its generation allowance. Review and publish the saved content, or resume to continue generating."
                : data.run.error ||
                  "Generation was cancelled. Your proposal is preserved."}
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void action("resume", {}).catch(() => {})}
              >
                Resume run
              </Button>
            </div>
          )}
          {applied && w.receipt?.cacheRefreshPending && (
            <div className="admin-error" role="alert">
              Content is published; refreshing the public cache is still
              pending.
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void action("accept", { key: w.acceptedKey }).catch(() => {})
                }
              >
                Refresh published content
              </Button>
            </div>
          )}
          {applied && (
            <div className="admin-notice">
              Published {w.receipt?.records?.length || 0} records on{" "}
              {new Date(w.receipt?.publishedAt).toLocaleString()}. Existing
              content revisions and the batch audit receipt remain available.
            </div>
          )}
          <div
            className="ai-builder-tabs"
            role="group"
            aria-label="Workspace view"
          >
            {[
              ["review", "Review content", Eye],
              ["chat", "Chat", MessageSquare],
            ].map(([key, label, Icon]: any) => (
              <Button
                key={key}
                variant={view === key ? "default" : "outline"}
                onClick={() => setView(key)}
              >
                {<Icon size={16} />} {label}
              </Button>
            ))}
          </div>
          <div className={`ai-builder-layout view-${view}`}>
            <section
              className="ai-builder-chat"
              aria-label="Website assistant chat"
            >
              <h2>Website Assistant</h2>
              <details>
                <summary>Restaurant brief</summary>
                <p className="ai-builder-copy">{w.brief}</p>
                <p>Languages: {w.locales.join(", ")}</p>
              </details>
              <div className="ai-builder-messages">
                {data.messages.map((m: any) => (
                  <article
                    key={m.id}
                    className={`ai-builder-message ${m.role}`}
                  >
                    <strong>
                      {m.role === "user" ? "You" : "Website Assistant"}
                    </strong>
                    <p className="ai-builder-copy">{m.body.message}</p>
                  </article>
                ))}
              </div>
              {!applied && (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const text = questions.length
                      ? questions
                          .map(
                            (q: any) =>
                              `${q.question}\n${answers[q.id] || "Not provided"}`,
                          )
                          .join("\n\n") + (message ? "\n\n" + message : "")
                      : message;
                    if (!text.trim()) return;
                    try {
                      await action("message", {
                        key: crypto.randomUUID(),
                        message: text,
                      });
                      setMessage("");
                      setAnswers({});
                    } catch {}
                  }}
                >
                  {questions.map((q: any) => (
                    <label className="admin-form-field" key={q.id}>
                      <span>
                        {q.question}
                        {q.required ? " *" : ""}
                      </span>
                      {q.kind === "select" ? (
                        <select
                          className="admin-input"
                          required={q.required}
                          value={answers[q.id] || ""}
                          onChange={(e) =>
                            setAnswers({ ...answers, [q.id]: e.target.value })
                          }
                        >
                          <option value="">Choose…</option>
                          {q.options.map((v: string) => (
                            <option key={v}>{v}</option>
                          ))}
                        </select>
                      ) : (
                        <textarea
                          className="admin-input"
                          required={q.required}
                          rows={q.kind === "multiline" ? 5 : 2}
                          value={answers[q.id] || ""}
                          onChange={(e) =>
                            setAnswers({ ...answers, [q.id]: e.target.value })
                          }
                        />
                      )}
                    </label>
                  ))}
                  <label className="admin-form-field">
                    <span>
                      {questions.length
                        ? "Additional instructions"
                        : "Tell the agent what to create or improve"}
                    </span>
                    <textarea
                      className="admin-input"
                      rows={4}
                      disabled={running}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Create Home, Menu, About and Contact in English and Bulgarian. Use our restaurant photographs…"
                    />
                  </label>
                  <Button
                    type="submit"
                    disabled={
                      running || busy || (!questions.length && !message.trim())
                    }
                  >
                    {questions.length ? "Send answers" : "Send instruction"}
                  </Button>
                  <a
                    className="ai-builder-media-link"
                    href="/admin/media"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Upload restaurant photos <ArrowUpRight size={14} />
                  </a>
                </form>
              )}
              {data.run && (
                <small>
                  {data.run.calls} model calls ·{" "}
                  {(
                    data.run.inputTokens + data.run.outputTokens
                  ).toLocaleString()}{" "}
                  tokens · gpt-6-luna
                </small>
              )}
            </section>
            <section className="ai-builder-review" aria-label="Proposal review">
              <h2>Review everything</h2>
              <p>
                {w.operations.length} proposed records · {errors.length} issues
                to correct · {data.conflicts.length} conflicts
              </p>
              {data.issues.length > 0 && (
                <details className="ai-builder-issues" open={errors.length > 0}>
                  <summary>Validation and completeness</summary>
                  <ul>
                    {data.issues.map((i: any, index: number) => (
                      <li key={index}>
                        <strong>
                          {i.key} · {i.field}
                        </strong>
                        : {i.message}
                        {i.severity === "warning" ? " (suggestion)" : ""}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {data.conflicts.map((c: any) => {
                const op = w.operations.find((o: any) => o.key === c.key);
                return (
                  <div className="admin-error" key={c.key}>
                    <strong>{labelDraft(op)} changed in the CMS.</strong>
                    <details>
                      <summary>
                        Compare before choosing which changes to keep
                      </summary>
                      <div className="ai-conflict-grid">
                        <div>
                          <h3>Original</h3>
                          <Readable
                            value={op.baseline}
                            context={data.context}
                          />
                        </div>
                        <div>
                          <h3>Current CMS</h3>
                          <Readable value={c.current} context={data.context} />
                        </div>
                        <div>
                          <h3>Your proposal</h3>
                          <Readable value={op.payload} context={data.context} />
                        </div>
                      </div>
                    </details>
                    <Button
                      variant="outline"
                      disabled={running || busy || applied}
                      onClick={() => {
                        if (
                          window.confirm(
                            "Keep the proposed values over the current CMS changes shown above?",
                          )
                        )
                          void action("rebase", { key: c.key }).catch(() => {});
                      }}
                    >
                      Keep proposal over current CMS edits
                    </Button>
                  </div>
                );
              })}
              <div className="ai-builder-preview-controls">
                <label>
                  Preview page
                  <select
                    className="admin-input"
                    value={preview}
                    onChange={(e) => setPreview(e.target.value)}
                  >
                    <option value="">Whole website</option>
                    {data.previewPages.flatMap((p: any) =>
                      p.translations.map((t: any) => (
                        <option key={p.id + t.locale} value={t.url}>
                          {t.title} · {t.locale}
                        </option>
                      )),
                    )}
                    {w.operations
                      .filter((o: any) =>
                        ["banners", "slides"].includes(o.resource),
                      )
                      .map((o: any) => (
                        <option
                          key={o.key}
                          value={`/preview/site/${id}?${o.resource === "banners" ? "banner" : "slide"}=${o.targetId}`}
                        >
                          {labelDraft(o)} · signage
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Preview size
                  <select
                    className="admin-input"
                    value={device}
                    onChange={(e) => setDevice(e.target.value)}
                  >
                    <option value="desktop">Desktop</option>
                    <option value="mobile">Mobile</option>
                  </select>
                </label>
                <a
                  href={preview || `/preview/site/${id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open preview <ArrowUpRight size={14} />
                </a>
              </div>
              <div className={`ai-builder-preview ${device}`}>
                <iframe
                  key={w.revision + preview}
                  title="Private website proposal preview"
                  src={preview || `/preview/site/${id}`}
                />
              </div>
              <details>
                <summary>SEO and sharing metadata</summary>
                {data.previewPages.flatMap((p: any) =>
                  p.translations.map((t: any) => (
                    <article key={p.id + t.locale}>
                      <h3>
                        {t.title} · {t.locale}
                      </h3>
                      <dl>
                        <dt>SEO title</dt>
                        <dd>{t.seoTitle || t.title}</dd>
                        <dt>Description</dt>
                        <dd>{t.seoDescription || "Missing"}</dd>
                        <dt>Canonical</dt>
                        <dd>
                          {t.canonicalUrl ||
                            "Generated from the restaurant domain and page URL"}
                        </dd>
                        <dt>Social title</dt>
                        <dd>{t.ogTitle || t.seoTitle || t.title}</dd>
                        <dt>Social description</dt>
                        <dd>
                          {t.ogDescription || t.seoDescription || "Missing"}
                        </dd>
                        <dt>Search indexing</dt>
                        <dd>
                          {t.noIndex ? "Disabled" : "Enabled after acceptance"}
                        </dd>
                      </dl>
                    </article>
                  )),
                )}
              </details>
              {[...new Set(w.operations.map((o: any) => o.resource))].map(
                (resource: any) => (
                  <section key={resource} className="ai-builder-group">
                    <h3>
                      {(areas as any)[resource]?.title ||
                        resource.charAt(0).toUpperCase() + resource.slice(1)}
                    </h3>
                    {w.operations
                      .filter((o: any) => o.resource === resource)
                      .map((op: any) => (
                        <article key={op.key}>
                          <div>
                            <strong>{labelDraft(op)}</strong>
                            <small>
                              {op.isNew ? "New" : "Update"}
                              {op.manual ? " · Manual edits protected" : ""}
                            </small>
                          </div>
                          <div className="ai-builder-actions">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={running || applied}
                              onClick={() => {
                                setEditing(op);
                                setDirty(false);
                              }}
                            >
                              Review / edit
                            </Button>
                            {op.manual && !applied && (
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={running || busy}
                                onClick={() =>
                                  void action("unlock", { key: op.key }).catch(
                                    () => {},
                                  )
                                }
                              >
                                Allow AI revisions
                              </Button>
                            )}
                            {!applied && (
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={running || busy}
                                onClick={() =>
                                  void action("remove", { key: op.key }).catch(
                                    () => {},
                                  )
                                }
                              >
                                Remove from proposal
                              </Button>
                            )}
                          </div>
                        </article>
                      ))}
                  </section>
                ),
              )}
            </section>
          </div>
        </>
      )}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogTitle>Update your website</DialogTitle>
          <DialogDescription>
            The assistant works with this website’s existing content and
            settings. Describe what you want to change; review the proposed
            updates before publishing.
          </DialogDescription>
          <form className="content-form" onSubmit={create}>
            <label className="admin-form-field">
              Request name
              <input
                className="admin-input"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label className="admin-form-field">
              Requested changes and restaurant facts
              <textarea
                className="admin-input"
                required
                rows={10}
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                placeholder="Tell the assistant what to add or update: change menu prices, improve a page, translate content, update opening hours or refresh SEO. Include confirmed facts and the languages you need."
              />
            </label>
            <label className="admin-form-field">
              Website languages (codes separated by commas)
              <input
                className="admin-input"
                required
                value={locales}
                onChange={(e) => setLocales(e.target.value)}
                placeholder="en, bg"
              />
            </label>
            <label className="admin-check">
              <input
                type="checkbox"
                checked={signage}
                onChange={(e) => setSignage(e.target.checked)}
              />
              Include digital signage in this request
            </label>
            <Button type="submit" disabled={busy}>
              {busy ? "Starting…" : "Prepare updates"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={reviewCurrent}
        onOpenChange={(open) => {
          if (!open) setFactReview(null);
        }}
      >
        <DialogContent>
          <DialogTitle>Review business facts before publishing</DialogTitle>
          <DialogDescription>
            These values need your confirmation. Check prices, restaurant
            details, and dietary/allergen assignments against your records.
            Close this review to edit anything that is incorrect. Confirming
            publishes the entire proposal.
          </DialogDescription>
          <div className="space-y-4">
            {factOperations.map((op: any) => {
              const fields = [
                ...new Set<string>(
                  factIssues
                    .filter((i: any) => i.key === op.key)
                    .map((i: any) => i.field),
                ),
              ];
              return (
                <section key={op.key} className="rounded border p-3">
                  <h3 className="font-semibold">{labelDraft(op)}</h3>
                  <Readable
                    value={Object.fromEntries(
                      fields
                        .map((field) => [field, op.payload[field]])
                        .concat(
                          op.resource === "items"
                            ? [["currency", op.payload.currency]]
                            : [],
                        ),
                    )}
                    context={data.context}
                  />
                </section>
              );
            })}
          </div>
          <label className="admin-check">
            <input
              type="checkbox"
              checked={factsConfirmed}
              onChange={(e) => setFactsConfirmed(e.target.checked)}
            />
            I have reviewed and confirm these prices, restaurant details, and
            dietary/allergen assignments.
          </label>
          <Button
            disabled={busy || !factsConfirmed || !reviewCurrent}
            onClick={() => {
              if (factReview) void publish(factReview);
            }}
          >
            Confirm and publish all
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!editing}
        onOpenChange={(open) => {
          if (
            !open &&
            (!dirty ||
              window.confirm("Close without saving your proposal edits?"))
          ) {
            setEditing(null);
            setDirty(false);
          }
        }}
      >
        <DialogContent>
          <DialogTitle>
            Review {editing ? labelDraft(editing) : "content"}
          </DialogTitle>
          <DialogDescription>
            Edits stay in this proposal. Saving confirms that you reviewed this
            record’s business facts and protects it from automatic AI revisions.
          </DialogDescription>
          {editing &&
            (!structurallyEditable(editing.payload) ? (
              <div>
                <p>
                  This generated structure needs repair. Its draft content is
                  preserved below. Ask the agent to repair it before using the
                  structured editor.
                </p>
                <Readable value={editing.payload} context={data.context} />
                <Button
                  onClick={() => {
                    setMessage(
                      `Repair the structure and validation errors for proposal record ${editing.key}, preserving its useful text.`,
                    );
                    setEditing(null);
                    setView("chat");
                  }}
                >
                  Ask agent to repair
                </Button>
              </div>
            ) : (areas as any)[editing.resource] ? (
              <ContentForm
                key={editing.key}
                resource={editing.resource as Resource}
                row={{ ...editing.payload, id: editing.targetId }}
                context={data.context}
                onSaved={() => {
                  setEditing(null);
                  setDirty(false);
                }}
                onDirty={setDirty}
                draftSave={saveDraft}
              />
            ) : (
              <AiProposalEditor
                key={editing.key}
                operation={editing}
                context={data.context}
                onSave={saveDraft}
                onDirty={setDirty}
              />
            ))}
        </DialogContent>
      </Dialog>
    </>
  );
}
