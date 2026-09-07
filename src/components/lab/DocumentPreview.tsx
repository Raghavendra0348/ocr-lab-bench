import { useEffect, useRef } from "react";
import type { OCRBox } from "@/ocr/ocrTypes";

export function DocumentPreview({
  imageUrl,
  boxes,
  showBoxes,
  showText,
}: {
  imageUrl: string | null;
  boxes: OCRBox[];
  showBoxes: boolean;
  showText: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageUrl) return;
    let cancelled = false;

    const image = new Image();
    image.onload = () => {
      if (cancelled) return;
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0);

      if (!showBoxes || boxes.length === 0) return;

      const unit = Math.max(1.5, Math.min(canvas.width, canvas.height) / 400);
      boxes.forEach((box, index) => {
        if (box.poly.length < 3) return;
        const hue = (index * 47) % 360;
        ctx.lineWidth = unit;
        ctx.strokeStyle = `hsl(${hue} 90% 55%)`;
        ctx.fillStyle = `hsl(${hue} 90% 55% / 0.12)`;
        ctx.beginPath();
        ctx.moveTo(box.poly[0]!.x, box.poly[0]!.y);
        for (let i = 1; i < box.poly.length; i++) ctx.lineTo(box.poly[i]!.x, box.poly[i]!.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        if (!showText || !box.text) return;
        const height = Math.max(10, box.bbox.y2 - box.bbox.y1);
        const fontSize = Math.min(height * 0.95, 28 * unit);
        ctx.font = `${fontSize}px "IBM Plex Mono", monospace`;
        const label = box.text.length > 34 ? `${box.text.slice(0, 33)}…` : box.text;
        const metrics = ctx.measureText(label);
        const padding = unit * 2;
        const boxY = Math.max(0, box.bbox.y1 - fontSize - padding * 1.6);
        ctx.fillStyle = "hsl(220 30% 8% / 0.82)";
        ctx.fillRect(box.bbox.x1, boxY, metrics.width + padding * 2, fontSize + padding * 1.4);
        ctx.fillStyle = `hsl(${hue} 95% 78%)`;
        ctx.fillText(label, box.bbox.x1 + padding, boxY + fontSize + padding * 0.1);
      });
    };
    image.src = imageUrl;

    return () => {
      cancelled = true;
    };
  }, [imageUrl, boxes, showBoxes, showText]);

  if (!imageUrl) {
    return (
      <div className="flex min-h-[280px] items-center justify-center rounded-lg border border-dashed border-border bg-surface p-8 text-center text-sm text-muted-foreground">
        No document loaded yet. Upload an image or PDF to preview it here.
      </div>
    );
  }

  return (
    <div className="max-h-[70vh] overflow-auto rounded-lg border border-border bg-surface p-2">
      <canvas ref={canvasRef} className="h-auto w-full" />
    </div>
  );
}
