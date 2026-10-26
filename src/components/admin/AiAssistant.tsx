"use client";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Bot, Send, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  mergeChanges,
  sameValue,
  type AiChange,
  type AiChatMessage,
  type AiScope,
} from "@/modules/ai/contracts";

export type AiAssistantHandle = { attach: (id: string) => Promise<void> };
type Props = {
  scope: AiScope;
  recordId?: string;
  templateId?: string;
  sourceMode?: string;
  getValues: () => Record<string, any>;
  setField: (field: string, value: any) => void;
  initialLocale?: string;
  onlyLocale?: string;
  translationOnly?: boolean;
  conversationId?: string;
  onConversation?: (id: string) => void;
  retainDraft?: boolean;
};
async function api(path: string, body?: unknown, method = "POST") {
  const response = await fetch("/api/ai/conversations" + path, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = response.status === 204 ? {} : await response.json();
  if (!response.ok)
    throw new Error(data.error || "Unable to contact the assistant.");
  return data;
}

export const AiAssistant = forwardRef<AiAssistantHandle, Props>(
  function AiAssistant(props, ref) {
    const [open, setOpen] = useState(false);
    const [mobileView, setMobileView] = useState("chat");
    const [conversation, setConversation] = useState<any>(null);
    const [messages, setMessages] = useState<AiChatMessage[]>([]);
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [locales, setLocales] = useState<
      Array<{ code: string; label: string }>
    >([]);
    const [selectedLocales, setSelectedLocales] = useState<string[]>([]);
    const [text, setText] = useState("");
    const [answers, setAnswers] = useState<
      Record<string, Record<string, string>>
    >({});
    const [busy, setBusy] = useState(false);
    const [configured, setConfigured] = useState(true);
    const [error, setError] = useState("");
    const [undo, setUndo] = useState<
      Array<{ id: string; before: Record<string, any>; applied: AiChange[] }>
    >([]);
    const live = useRef(props);
    live.current = props;
    const state = useRef({
      conversationId: "",
      recordId: props.recordId,
      mounted: true,
    });
    if (props.conversationId)
      state.current.conversationId = props.conversationId;
    useEffect(() => {
      const session = state.current;
      session.mounted = true;
      return () => {
        session.mounted = false;
        if (
          session.conversationId &&
          !session.recordId &&
          !live.current.retainDraft
        ) {
          void fetch("/api/ai/conversations/" + session.conversationId, {
            method: "DELETE",
            keepalive: true,
          });
        }
      };
    }, []);
    useImperativeHandle(
      ref,
      () => ({
        attach: async (id) => {
          state.current.recordId = id;
          if (!state.current.conversationId) return;
          try {
            await api(
              "/" + state.current.conversationId,
              { recordId: id },
              "PATCH",
            );
          } catch (e) {
            toast.error(
              "Content saved, but chat history could not be attached: " +
                (e as Error).message,
            );
          }
        },
      }),
      [],
    );

    async function load() {
      setBusy(true);
      setError("");
      try {
        const data = props.conversationId
          ? await api("/" + props.conversationId, undefined, "GET")
          : await api("", {
              scope: props.scope,
              recordId: state.current.recordId || null,
            });
        if (!state.current.mounted) {
          if (!state.current.recordId)
            void api("/" + data.conversation.id, undefined, "DELETE");
          return;
        }
        state.current.conversationId = data.conversation.id;
        props.onConversation?.(data.conversation.id);
        setConversation(data.conversation);
        setMessages(data.messages);
        setNextCursor(data.nextCursor);
        setLocales(data.locales);
        setSelectedLocales([
          props.onlyLocale || props.initialLocale || data.defaultLocale,
        ]);
        setConfigured(data.configured);
      } catch (e) {
        if (state.current.mounted) setError((e as Error).message);
      } finally {
        if (state.current.mounted) setBusy(false);
      }
    }
    async function send(questionMessage?: AiChatMessage) {
      if (busy || !conversation) return;
      const snapshot = structuredClone(live.current.getValues());
      const templateId = live.current.templateId;
      const body = {
        key: crypto.randomUUID(),
        revision: conversation.revision,
        message: questionMessage ? "" : text,
        answers: questionMessage
          ? questionMessage.body.questions!.map((q) => ({
              questionId: q.id,
              answer: answers[questionMessage.id]?.[q.id] || "",
            }))
          : [],
        questionMessageId: questionMessage?.id,
        draft: snapshot,
        locales: props.onlyLocale ? [props.onlyLocale] : selectedLocales,
        templateId,
        sourceMode: live.current.sourceMode,
        translationOnly: Boolean(props.translationOnly),
      };
      setBusy(true);
      setError("");
      try {
        const latest = await api("/" + conversation.id, undefined, "GET");
        body.revision = latest.conversation.revision;
        setMessages(latest.messages);
        const result = await api("/" + conversation.id, body);
        if (!state.current.mounted) return;
        setConversation({ ...conversation, revision: result.revision });
        setMessages((previous) => [
          ...previous,
          { id: body.key, role: "user", body: result.userBody },
          result.message,
        ]);
        setText("");
        if (templateId !== live.current.templateId) {
          setError(
            "The template changed during generation. No AI changes were applied.",
          );
          return;
        }
        const { applied, conflicts } = mergeChanges(
          live.current.getValues(),
          snapshot,
          result.message.body.changes || [],
        );
        for (const change of applied)
          live.current.setField(change.field, change.value);
        if (applied.length) {
          setUndo((previous) => [
            ...previous,
            { id: result.message.id, before: snapshot, applied },
          ]);
          toast.success("AI filled the form. Review and save when ready.");
        }
        if (conflicts.length)
          setError(
            "Kept your newer edits to: " +
              conflicts.join(", ") +
              ". Ask the assistant to refine those fields again.",
          );
      } catch (e) {
        if (state.current.mounted) setError((e as Error).message);
      } finally {
        if (state.current.mounted) setBusy(false);
      }
    }
    function undoResponse(id: string) {
      const entry = undo.find((item) => item.id === id);
      if (!entry) return;
      const current = live.current.getValues();
      const skipped: string[] = [];
      for (const change of entry.applied) {
        if (sameValue(current[change.field], change.value))
          live.current.setField(change.field, entry.before[change.field]);
        else skipped.push(change.field);
      }
      setUndo((items) => items.filter((item) => item.id !== id));
      if (skipped.length)
        setError("Kept subsequent edits to: " + skipped.join(", "));
    }
    return (
      <section
        className="ai-assistant"
        data-mobile-view={open ? mobileView : "editor"}
        aria-label="AI assistant"
      >
        <div className="ai-heading">
          <Button
            type="button"
            variant="outline"
            aria-expanded={open}
            onClick={() => {
              setOpen(!open);
              if (!open && !conversation) void load();
            }}
          >
            <Bot size={18} /> AI assistant
          </Button>
          <span>Current editor only · gpt-6-luna</span>
        </div>
        {open && (
          <div
            className="ai-mobile-views"
            role="group"
            aria-label="Editor view"
          >
            <Button
              type="button"
              variant="outline"
              aria-pressed={mobileView === "editor"}
              onClick={() => setMobileView("editor")}
            >
              Editor
            </Button>
            <Button
              type="button"
              variant="outline"
              aria-pressed={mobileView === "chat"}
              onClick={() => setMobileView("chat")}
            >
              AI chat
            </Button>
          </div>
        )}
        {open && (
          <div className="ai-panel">
            <p className="ai-intro">
              What would you like to create or improve? Tell me your goal and
              preferred languages. I can fill this editor; you decide when to
              save or publish. Your chat is private to your account.
            </p>
            {!configured && (
              <p role="status">
                AI assistance is not configured. Ask your administrator to set
                OPENAI_API_KEY. You can continue editing manually.
              </p>
            )}
            {nextCursor && (
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const data = await api(
                      `/${conversation.id}?before=${encodeURIComponent(nextCursor)}`,
                      undefined,
                      "GET",
                    );
                    setMessages((rows) => [...data.messages, ...rows]);
                    setNextCursor(data.nextCursor);
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Load older messages
              </Button>
            )}
            <div
              className="ai-messages"
              role="log"
              aria-label="Assistant conversation"
              aria-live="polite"
              aria-relevant="additions"
            >
              {messages.map((message) => (
                <article
                  className={`ai-message ai-message-${message.role}`}
                  key={message.id}
                >
                  <strong>
                    {message.role === "user" ? "You" : "Assistant"}
                  </strong>
                  {message.body.message && <p>{message.body.message}</p>}
                  {Boolean(message.body.warnings?.length) && (
                    <div role="status">
                      <strong>Draft needs correction before saving</strong>
                      <ul>
                        {message.body.warnings!.map((warning, index) => (
                          <li key={index}>
                            {warning.field}: {warning.message}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {message.body.unapplied?.map((draft, index) => (
                    <details key={index}>
                      <summary>
                        {draft.field}: generated text available to copy
                      </summary>
                      <p>{draft.reason}</p>
                      <textarea
                        className="admin-input"
                        aria-label={`Generated draft for ${draft.field}`}
                        value={draft.text}
                        readOnly
                        rows={6}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(draft.text);
                            toast.success("Generated draft copied.");
                          } catch {
                            toast.error(
                              "Select the draft text and copy it manually.",
                            );
                          }
                        }}
                      >
                        Copy draft
                      </Button>
                    </details>
                  ))}
                  {message.body.answers && (
                    <div className="ai-table-scroll">
                      <table>
                        <caption>Your answers</caption>
                        <thead>
                          <tr>
                            <th>Question</th>
                            <th>Your answer</th>
                          </tr>
                        </thead>
                        <tbody>
                          {message.body.answers.map((answer) => (
                            <tr key={answer.questionId}>
                              <th scope="row">{answer.question}</th>
                              <td>{answer.answer || "Not supplied"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {message.body.questions?.length ? (
                    <div>
                      <div className="ai-table-scroll">
                        <table>
                          <caption>
                            Fill in your answers, then send them together
                          </caption>
                          <thead>
                            <tr>
                              <th>Question</th>
                              <th>Your answer</th>
                            </tr>
                          </thead>
                          <tbody>
                            {message.body.questions.map((question) => {
                              const answered = messages.some(
                                (m) =>
                                  m.role === "user" &&
                                  m.body.answers?.some(
                                    (a) => a.questionId === question.id,
                                  ) &&
                                  messages.indexOf(m) >
                                    messages.indexOf(message),
                              );
                              const common = {
                                "aria-label": "Answer: " + question.question,
                                value: answers[message.id]?.[question.id] || "",
                                disabled: busy || answered,
                                "aria-required": question.required,
                                onChange: (
                                  e: React.ChangeEvent<
                                    | HTMLInputElement
                                    | HTMLTextAreaElement
                                    | HTMLSelectElement
                                  >,
                                ) =>
                                  setAnswers((old) => ({
                                    ...old,
                                    [message.id]: {
                                      ...old[message.id],
                                      [question.id]: e.target.value,
                                    },
                                  })),
                              };
                              return (
                                <tr key={question.id}>
                                  <th scope="row">
                                    {question.question}
                                    {question.required && (
                                      <span aria-label="required"> *</span>
                                    )}
                                  </th>
                                  <td>
                                    {question.kind === "select" ? (
                                      <select
                                        {...common}
                                        className="admin-input"
                                      >
                                        <option value="">
                                          Choose an answer
                                        </option>
                                        {question.options.map((option) => (
                                          <option key={option}>{option}</option>
                                        ))}
                                      </select>
                                    ) : question.kind === "multiline" ? (
                                      <textarea
                                        {...common}
                                        className="admin-input"
                                        rows={3}
                                      />
                                    ) : (
                                      <input
                                        {...common}
                                        className="admin-input"
                                      />
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={
                          busy ||
                          !configured ||
                          messages.some(
                            (m, i) =>
                              i > messages.indexOf(message) &&
                              Boolean(m.body.answers?.length),
                          )
                        }
                        onClick={() => void send(message)}
                      >
                        Send answers
                      </Button>
                    </div>
                  ) : null}
                  {message.body.changes?.length ? (
                    <p className="ai-change-summary">
                      Generated fields:{" "}
                      {message.body.changes.map((c) => c.field).join(", ")}.
                      Changes require Save.
                    </p>
                  ) : null}
                  {undo.some((item) => item.id === message.id) && (
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => undoResponse(message.id)}
                    >
                      <Undo2 size={16} /> Undo these changes
                    </Button>
                  )}
                </article>
              ))}
            </div>
            {!props.onlyLocale && (
              <fieldset className="ai-locales">
                <legend>Content languages</legend>
                {locales.map((locale) => (
                  <label key={locale.code}>
                    <input
                      type="checkbox"
                      checked={selectedLocales.includes(locale.code)}
                      disabled={busy}
                      onChange={(e) =>
                        setSelectedLocales((old) =>
                          e.target.checked
                            ? [...old, locale.code]
                            : old.filter((code) => code !== locale.code),
                        )
                      }
                    />
                    {locale.label}
                  </label>
                ))}
              </fieldset>
            )}
            <label className="admin-form-field">
              <span>Message to assistant</span>
              <textarea
                className="admin-input"
                rows={3}
                value={text}
                maxLength={12000}
                disabled={busy || !configured}
                onChange={(e) => setText(e.target.value)}
                placeholder="For example: create a welcoming homepage in English and Bulgarian…"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
            </label>
            {error && (
              <p role="alert" className="field-error">
                {error}
              </p>
            )}
            <div className="ai-controls">
              <Button
                type="button"
                disabled={
                  busy ||
                  !configured ||
                  !conversation ||
                  !text.trim() ||
                  (!props.onlyLocale && !selectedLocales.length)
                }
                onClick={() => void send()}
              >
                <Send size={16} />
                {busy ? "Working…" : "Send message"}
              </Button>
              {!conversation && !busy && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void load()}
                >
                  Retry connection
                </Button>
              )}
              {conversation && !props.retainDraft && (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={async () => {
                    if (
                      !window.confirm(
                        "Clear your chat history for this record? Form changes remain unchanged.",
                      )
                    )
                      return;
                    setBusy(true);
                    try {
                      await api("/" + conversation.id, undefined, "DELETE");
                      state.current.conversationId = "";
                      props.onConversation?.("");
                      setConversation(null);
                      setMessages([]);
                      setUndo([]);
                      setOpen(false);
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Clear chat history
                </Button>
              )}
            </div>
            {busy && (
              <p role="status">
                The assistant is working. Your form will be updated only after
                validation.
              </p>
            )}
          </div>
        )}
      </section>
    );
  },
);
