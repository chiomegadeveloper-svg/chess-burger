"use client";

import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { canvasToWebpUnder1Mb, loadImageFile } from "./media";

export default function StaffImageEditor({
  file,
  onCancel,
  onSave,
}: {
  file: File | null;
  onCancel: () => void;
  onSave: (file: File) => Promise<void>;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const source = useRef<HTMLImageElement | null>(null);
  const disposeSource = useRef<(() => void) | null>(null);
  const [zoom, setZoom] = useState(1);
  const [x, setX] = useState(50);
  const [y, setY] = useState(50);
  const [ratio, setRatio] = useState("1.7777778");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setReady(false);
    setZoom(1);
    setX(50);
    setY(50);
    setError("");
    disposeSource.current?.();
    disposeSource.current = null;
    source.current = null;

    if (file)
      void loadImageFile(file)
        .then((loaded) => {
          if (!active) {
            loaded.dispose();
            return;
          }
          source.current = loaded.image;
          disposeSource.current = loaded.dispose;
          setReady(true);
        })
        .catch((cause) => {
          if (active)
            setError(
              cause instanceof Error
                ? cause.message
                : "This image cannot be opened.",
            );
        });

    return () => {
      active = false;
      disposeSource.current?.();
      disposeSource.current = null;
      source.current = null;
    };
  }, [file]);

  useEffect(() => {
    const output = canvas.current;
    const image = source.current;
    if (!output || !image || !ready) return;

    const aspect = Number(ratio);
    output.width = 1200;
    output.height = Math.round(1200 / aspect);
    const context = output.getContext("2d");
    if (!context) {
      setError("This browser cannot process images.");
      setReady(false);
      return;
    }

    try {
      const base = Math.max(
        output.width / image.naturalWidth,
        output.height / image.naturalHeight,
      );
      const scale = base * zoom;
      const width = image.naturalWidth * scale;
      const height = image.naturalHeight * scale;
      context.clearRect(0, 0, output.width, output.height);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(
        image,
        -((width - output.width) * x) / 100,
        -((height - output.height) * y) / 100,
        width,
        height,
      );
    } catch {
      setError("The crop preview could not be drawn. Choose a smaller JPEG, PNG, or WebP photo.");
      setReady(false);
    }
  }, [ready, zoom, x, y, ratio]);

  async function save() {
    const output = canvas.current;
    if (!output) return;
    setBusy(true);
    setError("");
    try {
      const blob = await canvasToWebpUnder1Mb(output);
      await onSave(
        new File([blob], "staff-crop.webp", { type: "image/webp" }),
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "The image was not uploaded.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={!!file}
      onOpenChange={(open) => {
        if (!open && !busy) onCancel();
      }}
    >
      <DialogContent className="staff-image-editor">
        <DialogHeader>
          <DialogTitle>Crop & preview</DialogTitle>
          <DialogDescription>
            Adjust the image before uploading. Saved as WebP under 1 MB.
          </DialogDescription>
        </DialogHeader>
        <canvas ref={canvas} aria-label="Cropped image preview" />
        <label>
          Shape
          <select value={ratio} onChange={(event) => setRatio(event.target.value)}>
            <option value="1.7777778">Landscape · 16:9</option>
            <option value="1">Square · 1:1</option>
            <option value="0.75">Portrait · 3:4</option>
          </select>
        </label>
        <label>
          Zoom
          <input
            type="range"
            min="1"
            max="4"
            step=".01"
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
          />
        </label>
        <label>
          Horizontal position
          <input
            type="range"
            min="0"
            max="100"
            value={x}
            onChange={(event) => setX(Number(event.target.value))}
          />
        </label>
        <label>
          Vertical position
          <input
            type="range"
            min="0"
            max="100"
            value={y}
            onChange={(event) => setY(Number(event.target.value))}
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <button
          type="button"
          className="gold-button"
          disabled={!ready || busy}
          onClick={() => void save()}
        >
          {busy ? "Uploading…" : "Use crop & upload"}
        </button>
      </DialogContent>
    </Dialog>
  );
}
