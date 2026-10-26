"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { uploadImage } from "@/lib/media-upload";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
export function MediaPicker({
  media,
  value,
  onChange,
  label = "Image",
  buttonLabel,
}: {
  media: any[];
  value?: string;
  onChange: (id: string | null, asset?: any) => void;
  label?: string;
  buttonLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [uploaded, setUploaded] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [remote, setRemote] = useState<any[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedRemote, setSelectedRemote] = useState<any>(null);
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const available = search ? remote : [...remote, ...media.slice(0, 60)];
  const choices = [
    ...new Map(
      [...uploaded, ...available].map((asset) => [asset.id, asset]),
    ).values(),
  ];
  const selected = [...uploaded, ...media, ...remote, selectedRemote].find(
    (m) => m?.id === value,
  );
  useEffect(() => {
    if (!value || [...media, ...uploaded].some((m) => m.id === value)) return;
    const controller = new AbortController();
    fetch("/api/media/" + encodeURIComponent(value), {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (response.ok) setSelectedRemote(await response.json());
      })
      .catch(() => {});
    return () => controller.abort();
  }, [value, media, uploaded]);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          "/api/media?q=" + encodeURIComponent(search),
          { signal: controller.signal },
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setRemote(data.rows);
        setNextCursor(data.nextCursor);
      } catch (error) {
        if (!controller.signal.aborted) toast.error((error as Error).message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, search]);
  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const asset = await uploadImage(file);
      setUploaded([...uploaded, asset]);
      onChange(asset.id, asset);
      setOpen(false);
      toast.success(
        "Image uploaded. Add descriptive alt text before publishing.",
      );
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  return (
    <div className="media-picker">
      <span className="admin-field-label">{label}</span>
      {selected && (
        <img
          src={selected.thumbnailUrl || selected.url}
          alt={selected.alt}
          width={160}
          height={100}
        />
      )}
      <div>
        <Button type="button" variant="outline" onClick={() => setOpen(true)}>
          {buttonLabel || (selected ? "Change image" : "Choose image")}
        </Button>
        {value && (
          <Button type="button" variant="ghost" onClick={() => onChange(null)}>
            Remove
          </Button>
        )}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle className="dialog-title">Choose an image</DialogTitle>
          <DialogDescription>
            Select a library image or upload a photograph without leaving this
            editor.
          </DialogDescription>
          <div className="media-controls">
            <label>
              <span className="sr-only">Search images</span>
              <input
                className="admin-input"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search alt text or caption"
              />
            </label>
            <Button
              type="button"
              disabled={busy}
              onClick={() => input.current?.click()}
            >
              {busy ? "Uploading…" : "Upload image"}
            </Button>
            <input
              ref={input}
              className="sr-only"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              aria-label="Upload a new image"
              onChange={(e) => upload(e.target.files?.[0])}
            />
          </div>
          <div className="media-selection-grid">
            {choices
              .filter(
                (m) =>
                  !m.archived &&
                  `${m.alt} ${m.caption}`
                    .toLowerCase()
                    .includes(search.toLowerCase()),
              )
              .map((m) => (
                <button
                  type="button"
                  key={m.id}
                  onClick={() => {
                    onChange(m.id, m);
                    setOpen(false);
                  }}
                >
                  <img
                    src={m.thumbnailUrl || m.url}
                    alt={m.alt || "Library image"}
                    width={180}
                    height={130}
                    loading="lazy"
                  />
                  <span>{m.alt || m.caption || "Untitled image"}</span>
                </button>
              ))}
          </div>
          {loading && <p role="status">Loading images…</p>}
          {nextCursor && (
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                try {
                  const response = await fetch(
                    `/api/media?q=${encodeURIComponent(search)}&cursor=${encodeURIComponent(nextCursor)}`,
                  );
                  const data = await response.json();
                  if (!response.ok) throw new Error(data.error);
                  setRemote([...remote, ...data.rows]);
                  setNextCursor(data.nextCursor);
                } catch (error) {
                  toast.error((error as Error).message);
                }
              }}
            >
              Load more images
            </Button>
          )}
          {!loading && !choices.length && (
            <p>
              Your library is empty. Upload an approved image to get started.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
