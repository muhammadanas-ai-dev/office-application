// Stamps / watermarks UI (Day 32) — client component.
//
// Three tabs: a text watermark, an image watermark, and a rubber
// stamp. Each tab is a form that posts to its API route and
// creates a new version — the original file is never overwritten.
// Errors come from the route's JSON error message, so the user
// always sees a real reason, never a generic failure.
//
// A watermark or a stamp is drawn INTO the page content, so it
// is permanent — removing one later means restoring an earlier
// version. The page says so.
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";

interface PdfStampClientProps {
  document: { id: string; title: string; version: number };
  pageCount: number | null;
}

const sectionClass = "rounded-xl border border-[#dce3ec] bg-white p-4";
const inputClass =
  "h-9 w-full rounded-lg border border-[#dce3ec] bg-white px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3159c9]";
const buttonClass =
  "inline-flex h-9 items-center rounded-lg bg-[#3159c9] px-3 text-sm font-medium text-white hover:bg-[#2a4cab] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3159c9] disabled:opacity-60";
const labelClass = "mb-1 block text-xs font-medium text-[#202b3c]";
const tabClass = (active: boolean) =>
  `inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium ${
    active
      ? "bg-[#3159c9] text-white"
      : "border border-[#dce3ec] bg-white text-[#202b3c] hover:bg-[#f4f6fa]"
  }`;

const TEXT_POSITIONS = [
  { value: "centre-diagonal", label: "Diagonal across the centre" },
  { value: "centre", label: "Centre" },
  { value: "top-centre", label: "Top centre" },
  { value: "bottom-centre", label: "Bottom centre" },
] as const;

const IMAGE_POSITIONS = [
  { value: "centre", label: "Centre" },
  { value: "top-left", label: "Top left" },
  { value: "top-right", label: "Top right" },
  { value: "bottom-left", label: "Bottom left" },
  { value: "bottom-right", label: "Bottom right" },
] as const;

const STAMP_POSITIONS = [
  { value: "top-centre", label: "Top centre" },
  { value: "top-right", label: "Top right" },
  { value: "bottom-centre", label: "Bottom centre" },
  { value: "bottom-right", label: "Bottom right" },
] as const;

const STAMP_PRESETS = [
  "CONFIDENTIAL",
  "DRAFT",
  "APPROVED",
  "REVIEWED",
] as const;

const COLORS = [
  { value: "black", label: "Black" },
  { value: "grey", label: "Grey" },
  { value: "red", label: "Red" },
  { value: "green", label: "Green" },
  { value: "blue", label: "Blue" },
] as const;

export function PdfStampClient({ document, pageCount }: PdfStampClientProps) {
  const router = useRouter();
  const [tab, setTab] = useState<"text" | "image" | "stamp">("text");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Shared: which pages.
  const [pages, setPages] = useState("all");
  // Text watermark.
  const [text, setText] = useState("CONFIDENTIAL");
  const [textPosition, setTextPosition] = useState<string>("centre-diagonal");
  const [size, setSize] = useState(48);
  const [color, setColor] = useState<string>("red");
  const [opacity, setOpacity] = useState(0.3);
  const [rotation, setRotation] = useState(45);
  // Image watermark.
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePosition, setImagePosition] = useState<string>("centre");
  const [scale, setScale] = useState(0.5);
  // Stamp.
  const [stampText, setStampText] = useState<string>("CONFIDENTIAL");
  const [stampPosition, setStampPosition] = useState<string>("top-centre");
  const [stampColor, setStampColor] = useState<string>("red");

  async function postJson(path: string, body: Record<string, unknown>) {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        version?: number;
        error?: string;
      };
      if (!response.ok || !data.ok) {
        setError(data.error ?? "Could not apply the change.");
        return;
      }
      setMessage(`Saved as version ${data.version}.`);
      router.refresh();
    } catch {
      setError("Could not apply the change.");
    } finally {
      setBusy(false);
    }
  }

  async function submitTextWatermark(event: React.FormEvent) {
    event.preventDefault();
    await postJson(`/api/documents/${document.id}/pdf/add-watermark`, {
      kind: "text",
      text,
      pages,
      position: textPosition,
      size,
      color,
      opacity,
      rotation,
    });
  }

  async function submitImageWatermark(event: React.FormEvent) {
    event.preventDefault();
    if (!imageFile) {
      setError("Choose a PNG or JPEG image for the watermark.");
      return;
    }
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const form = new FormData();
      form.append("kind", "image");
      form.append("image", imageFile);
      form.append("pages", pages);
      form.append("position", imagePosition);
      form.append("scale", String(scale));
      form.append("opacity", String(opacity));
      form.append("rotation", String(rotation));
      const response = await fetch(
        `/api/documents/${document.id}/pdf/add-watermark`,
        { method: "POST", body: form }
      );
      const data = (await response.json()) as {
        ok?: boolean;
        version?: number;
        error?: string;
      };
      if (!response.ok || !data.ok) {
        setError(data.error ?? "Could not add the watermark.");
        return;
      }
      setMessage(`Saved as version ${data.version}.`);
      router.refresh();
    } catch {
      setError("Could not add the watermark.");
    } finally {
      setBusy(false);
    }
  }

  async function submitStamp(event: React.FormEvent) {
    event.preventDefault();
    await postJson(`/api/documents/${document.id}/pdf/add-stamp`, {
      text: stampText,
      pages,
      position: stampPosition,
      color: stampColor,
    });
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="text-xl font-semibold">Stamps &amp; watermarks</h1>
      <p className="mt-1 text-sm text-neutral-500">
        {document.title} — version {document.version}
        {pageCount !== null ? ` · ${pageCount} pages` : ""}
      </p>
      <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
        A watermark or a stamp is drawn into the PDF itself, so it is permanent.
        To remove one, restore an earlier version from the Versions page.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setTab("text")}
          className={tabClass(tab === "text")}
        >
          Text watermark
        </button>
        <button
          type="button"
          onClick={() => setTab("image")}
          className={tabClass(tab === "image")}
        >
          Image watermark
        </button>
        <button
          type="button"
          onClick={() => setTab("stamp")}
          className={tabClass(tab === "stamp")}
        >
          Stamp
        </button>
      </div>

      <div className="mt-4 flex flex-col gap-4">
        <div className={sectionClass}>
          <label className={labelClass} htmlFor="stamp-pages">
            Pages
          </label>
          <input
            id="stamp-pages"
            value={pages}
            onChange={(event) => setPages(event.target.value)}
            placeholder="all, or 1-3, 5"
            className={inputClass}
          />
          <p className="mt-1 text-xs text-neutral-500">
            “all” for every page, or a range like 1-3, 5.
          </p>
        </div>

        {tab === "text" ? (
          <form
            onSubmit={submitTextWatermark}
            className={`${sectionClass} flex flex-col gap-3`}
          >
            <div>
              <label className={labelClass} htmlFor="watermark-text">
                Text
              </label>
              <input
                id="watermark-text"
                value={text}
                onChange={(event) => setText(event.target.value)}
                maxLength={100}
                required
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="watermark-position">
                Position
              </label>
              <select
                id="watermark-position"
                value={textPosition}
                onChange={(event) => setTextPosition(event.target.value)}
                className={inputClass}
              >
                {TEXT_POSITIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass} htmlFor="watermark-size">
                  Font size
                </label>
                <input
                  id="watermark-size"
                  type="number"
                  min={8}
                  max={72}
                  value={size}
                  onChange={(event) => setSize(Number(event.target.value))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="watermark-color">
                  Colour
                </label>
                <select
                  id="watermark-color"
                  value={color}
                  onChange={(event) => setColor(event.target.value)}
                  className={inputClass}
                >
                  {COLORS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass} htmlFor="watermark-opacity">
                  Opacity ({opacity})
                </label>
                <input
                  id="watermark-opacity"
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.1}
                  value={opacity}
                  onChange={(event) => setOpacity(Number(event.target.value))}
                  className="h-9 w-full"
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="watermark-rotation">
                  Rotation
                </label>
                <select
                  id="watermark-rotation"
                  value={rotation}
                  onChange={(event) => setRotation(Number(event.target.value))}
                  className={inputClass}
                >
                  {[0, 30, 45, 60, 90].map((degrees) => (
                    <option key={degrees} value={degrees}>
                      {degrees}°
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <p className="text-xs text-neutral-500">
              The diagonal centre is the classic watermark: large, light,
              rotated 45°. The position setting is ignored for the diagonal — it
              always runs across the centre.
            </p>
            <button type="submit" disabled={busy} className={buttonClass}>
              {busy ? "Adding…" : "Add text watermark"}
            </button>
          </form>
        ) : null}

        {tab === "image" ? (
          <form
            onSubmit={submitImageWatermark}
            className={`${sectionClass} flex flex-col gap-3`}
          >
            <div>
              <label className={labelClass} htmlFor="watermark-image">
                Image (PNG or JPEG, at most 10 MB)
              </label>
              <input
                id="watermark-image"
                type="file"
                accept="image/png,image/jpeg"
                onChange={(event) =>
                  setImageFile(event.target.files?.[0] ?? null)
                }
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="watermark-image-position">
                Position
              </label>
              <select
                id="watermark-image-position"
                value={imagePosition}
                onChange={(event) => setImagePosition(event.target.value)}
                className={inputClass}
              >
                {IMAGE_POSITIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass} htmlFor="watermark-scale">
                  Size ({Math.round(scale * 100)}% of the page width)
                </label>
                <input
                  id="watermark-scale"
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.1}
                  value={scale}
                  onChange={(event) => setScale(Number(event.target.value))}
                  className="h-9 w-full"
                />
              </div>
              <div>
                <label
                  className={labelClass}
                  htmlFor="watermark-image-rotation"
                >
                  Rotation
                </label>
                <select
                  id="watermark-image-rotation"
                  value={rotation}
                  onChange={(event) => setRotation(Number(event.target.value))}
                  className={inputClass}
                >
                  {[0, 30, 45, 60, 90].map((degrees) => (
                    <option key={degrees} value={degrees}>
                      {degrees}°
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className={labelClass} htmlFor="watermark-image-opacity">
                Opacity ({opacity})
              </label>
              <input
                id="watermark-image-opacity"
                type="range"
                min={0.1}
                max={1}
                step={0.1}
                value={opacity}
                onChange={(event) => setOpacity(Number(event.target.value))}
                className="h-9 w-full"
              />
            </div>
            <button type="submit" disabled={busy} className={buttonClass}>
              {busy ? "Adding…" : "Add image watermark"}
            </button>
          </form>
        ) : null}

        {tab === "stamp" ? (
          <form
            onSubmit={submitStamp}
            className={`${sectionClass} flex flex-col gap-3`}
          >
            <div>
              <label className={labelClass} htmlFor="stamp-preset">
                Preset
              </label>
              <select
                id="stamp-preset"
                value={
                  STAMP_PRESETS.includes(
                    stampText as (typeof STAMP_PRESETS)[number]
                  )
                    ? stampText
                    : "custom"
                }
                onChange={(event) => {
                  if (event.target.value !== "custom")
                    setStampText(event.target.value);
                }}
                className={inputClass}
              >
                {STAMP_PRESETS.map((preset) => (
                  <option key={preset} value={preset}>
                    {preset}
                  </option>
                ))}
                <option value="custom">Custom text…</option>
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="stamp-text">
                Stamp text
              </label>
              <input
                id="stamp-text"
                value={stampText}
                onChange={(event) => setStampText(event.target.value)}
                maxLength={40}
                required
                className={inputClass}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass} htmlFor="stamp-position">
                  Position
                </label>
                <select
                  id="stamp-position"
                  value={stampPosition}
                  onChange={(event) => setStampPosition(event.target.value)}
                  className={inputClass}
                >
                  {STAMP_POSITIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass} htmlFor="stamp-color">
                  Colour
                </label>
                <select
                  id="stamp-color"
                  value={stampColor}
                  onChange={(event) => setStampColor(event.target.value)}
                  className={inputClass}
                >
                  {COLORS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <p className="text-xs text-neutral-500">
              The stamp is a bordered box with the text centred inside it, like
              a rubber stamp.
            </p>
            <button type="submit" disabled={busy} className={buttonClass}>
              {busy ? "Adding…" : "Add stamp"}
            </button>
          </form>
        ) : null}

        {message ? (
          <p className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
            {message}{" "}
            <Link
              href={`/documents/${document.id}/versions`}
              className="underline"
            >
              View versions
            </Link>
          </p>
        ) : null}
        {error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
