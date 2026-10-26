"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

const MAX_SIDE = 2400;

/** Shrinks a photo of a document so it fits through the hosting limit, and stays sharp enough to read. PDFs pass through. */
async function prepare(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    return blob ? new File([blob], "document.jpg", { type: "image/jpeg" }) : file;
  } catch {
    return file;   // e.g. a format this browser can't decode: the server will say if it isn't allowed
  }
}

export function DocumentUpload({ upload }: { upload: (form: FormData) => Promise<{ error?: string }> }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) { setError("Choose a file."); return; }
    setBusy(true);
    form.set("file", await prepare(file));
    const res = await upload(form).catch(() => ({ error: "Something went wrong. Try again." }));
    setBusy(false);
    if (res.error) setError(res.error);
    else formRef.current?.reset();
    router.refresh();
  }

  return (
    <form ref={formRef} onSubmit={submit} style={{ display: "grid", gap: "0.5rem" }}>
      <select name="kind" defaultValue="survey_plan" aria-label="Document type">
        <option value="survey_plan">Survey plan</option>
        <option value="c_of_o">Certificate of Occupancy</option>
        <option value="deed">Deed</option>
        <option value="other">Other document</option>
      </select>
      <input type="file" name="file" accept="image/jpeg,image/png,application/pdf,image/*" aria-label="Document file" />
      <button type="submit" className="btn secondary" disabled={busy}>{busy ? "Reading the document…" : "Upload and check"}</button>
      {error && <p className="small" style={{ color: "var(--flagged)", margin: 0 }}>{error}</p>}
    </form>
  );
}
