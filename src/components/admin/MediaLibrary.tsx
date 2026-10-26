"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { uploadImage } from "@/lib/media-upload";
import { Upload, LayoutGrid, List } from "lucide-react";
import { PageHeader } from "./PageHeader";
import { Button } from "@/components/ui/button";
import { AiAssistant } from "./AiAssistant";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
export default function MediaLibrary() {
  const [rows, setRows] = useState<any[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [archived, setArchived] = useState(false);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [editing, setEditing] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/media?q=${encodeURIComponent(search)}&archived=${archived}`,
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setRows(data.rows);
      setNextCursor(data.nextCursor);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  }, [search, archived]);
  useEffect(() => {
    const timer = setTimeout(load, 200);
    return () => clearTimeout(timer);
  }, [load]);
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    let succeeded = 0;
    for (const [index, file] of Array.from(files).entries()) {
      setProgress(`Uploading ${index + 1} of ${files.length}: ${file.name}`);
      try {
        const asset = await uploadImage(file);
        succeeded++;
        if (files.length === 1) setEditing(asset);
      } catch (error) {
        toast.error(`${file.name}: ${(error as Error).message}`);
      }
    }
    setUploading(false);
    setProgress("");
    if (input.current) input.current.value = "";
    if (succeeded) {
      toast.success(
        `${succeeded} image${succeeded === 1 ? "" : "s"} uploaded. Add descriptive alt text before publishing.`,
      );
      await load();
    }
  }
  return (
    <>
      <PageHeader
        title="Media library"
        description="Reuse approved photographs across pages, dishes and displays."
        actions={
          <Button disabled={uploading} onClick={() => input.current?.click()}>
            <Upload size={16} />
            {uploading ? "Uploading…" : "Upload images"}
          </Button>
        }
      />
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        multiple
        className="sr-only"
        aria-label="Upload images"
        onChange={(e) => upload(e.target.files)}
      />
      {progress && (
        <p role="status" className="admin-notice">
          {progress}
        </p>
      )}
      <div className="media-controls">
        <label>
          <span className="sr-only">Search images</span>
          <input
            className="admin-input"
            type="search"
            placeholder="Search alt text or captions…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label className="admin-check">
          <input
            type="checkbox"
            checked={archived}
            onChange={(e) => setArchived(e.target.checked)}
          />
          Archived images
        </label>
        <Button
          variant="outline"
          size="icon"
          aria-label="Grid view"
          onClick={() => setView("grid")}
        >
          <LayoutGrid size={18} />
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label="List view"
          onClick={() => setView("list")}
        >
          <List size={18} />
        </Button>
      </div>
      {loading ? (
        <div className="admin-skeleton" />
      ) : !rows.length ? (
        <div className="admin-empty">
          <h2>Your image library starts here</h2>
          <p>
            Upload food photographs, logos and restaurant images. Supported
            formats: JPEG, PNG, WebP and AVIF, up to 10 MB.
          </p>
        </div>
      ) : (
        <div className={`media-library ${view}`}>
          {rows.map((asset) => (
            <button
              key={asset.id}
              className="media-card"
              onClick={() => setEditing(asset)}
            >
              <img
                src={asset.thumbnailUrl || asset.url}
                alt={asset.alt || ""}
                width={240}
                height={180}
                loading="lazy"
              />
              <div>
                <strong>{asset.alt || "Add image description"}</strong>
                <small>
                  {asset.width} × {asset.height} ·{" "}
                  {Math.round(asset.size / 1024)} KB
                </small>
                <small>
                  {asset.references?.length || 0} tracked references
                </small>
              </div>
            </button>
          ))}
        </div>
      )}
      {nextCursor && (
        <Button
          variant="outline"
          onClick={async () => {
            try {
              const response = await fetch(
                `/api/media?q=${encodeURIComponent(search)}&archived=${archived}&cursor=${encodeURIComponent(nextCursor)}`,
              );
              const data = await response.json();
              if (!response.ok) throw new Error(data.error);
              setRows([...rows, ...data.rows]);
              setNextCursor(data.nextCursor);
            } catch (error) {
              toast.error((error as Error).message);
            }
          }}
        >
          Load more images
        </Button>
      )}
      <Dialog
        open={Boolean(editing)}
        onOpenChange={(open) => !open && setEditing(null)}
      >
        <DialogContent>
          <DialogTitle className="dialog-title">Image details</DialogTitle>
          <DialogDescription>
            Alt text describes the photograph to visitors who cannot see it.
          </DialogDescription>
          {editing && (
            <>
              <img
                className="media-detail-image"
                src={editing.url}
                alt={editing.alt || ""}
                width={editing.width}
                height={editing.height}
              />
              <form
                className="content-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    const response = await fetch("/api/media/" + editing.id, {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        alt: editing.alt,
                        caption: editing.caption,
                        archived: editing.archived,
                      }),
                    });
                    const data = await response.json();
                    if (!response.ok) throw new Error(data.error);
                    toast.success("Image details saved.");
                    setEditing(null);
                    await load();
                  } catch (error) {
                    toast.error((error as Error).message);
                  }
                }}
              >
                <AiAssistant
                  scope="media"
                  recordId={editing.id}
                  getValues={() => ({
                    alt: editing.alt,
                    caption: editing.caption,
                  })}
                  setField={(key, value) =>
                    setEditing((current: any) => ({ ...current, [key]: value }))
                  }
                />
                <label>
                  Alt text
                  <input
                    className="admin-input"
                    value={editing.alt}
                    onChange={(e) =>
                      setEditing({ ...editing, alt: e.target.value })
                    }
                  />
                </label>
                <label>
                  Caption
                  <textarea
                    className="admin-input"
                    value={editing.caption}
                    onChange={(e) =>
                      setEditing({ ...editing, caption: e.target.value })
                    }
                  />
                </label>
                <label className="admin-check">
                  <input
                    type="checkbox"
                    checked={editing.archived}
                    onChange={(e) =>
                      setEditing({ ...editing, archived: e.target.checked })
                    }
                  />
                  Archive image (existing uses keep working)
                </label>
                <p className="muted">
                  Uploaded {new Date(editing.createdAt).toLocaleString()}.{" "}
                  {editing.width} × {editing.height}. To replace a photograph,
                  upload a new image and select it in the editor; previous
                  revisions retain their original photograph.
                </p>
                {editing.references?.length > 0 && (
                  <div>
                    <h3>Usage</h3>
                    <ul>
                      {editing.references.map((r: any) => (
                        <li key={r.id}>
                          {r.targetType === "revision"
                            ? "Published page revision"
                            : r.targetType}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="save-bar">
                  <Button type="submit">Save details</Button>
                  {editing.archived && (
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={async () => {
                        if (
                          !window.confirm(
                            "Delete this archived image from the library? Referenced images are protected.",
                          )
                        )
                          return;
                        const response = await fetch(
                          "/api/media/" + editing.id,
                          { method: "DELETE" },
                        );
                        if (response.ok) {
                          toast.success("Library record deleted.");
                          setEditing(null);
                          await load();
                        } else {
                          const data = await response.json();
                          toast.error(data.error);
                        }
                      }}
                    >
                      Delete record
                    </Button>
                  )}
                </div>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
