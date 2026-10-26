"use client";
export async function uploadImage(file: File, alt = "") {
  const response = await fetch("/api/media/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: file.name,
      mime: file.type,
      size: file.size,
    }),
  });
  const signed = await response.json();
  if (!response.ok) throw new Error(signed.error || "Unable to start upload.");
  const body = new FormData();
  for (const [key, value] of Object.entries(signed.fields))
    body.append(key, String(value));
  body.append("file", file);
  const stored = await fetch(signed.url, { method: "POST", body });
  if (!stored.ok)
    throw new Error("Storage rejected the upload. Please try again.");
  const finish = await fetch("/api/media/finalize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ intentId: signed.intentId, alt }),
  });
  const asset = await finish.json();
  if (!finish.ok) throw new Error(asset.error || "Unable to verify image.");
  return asset;
}
