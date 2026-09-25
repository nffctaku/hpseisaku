"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Crop, ImagePlus, Loader2, RefreshCw, X, ZoomIn, ZoomOut } from "lucide-react";
import { toast } from "sonner";

type Aspect = "original" | "free" | "1:1" | "16:9";
type Status = "idle" | "uploading" | "error";

type Rect = { x: number; y: number; w: number; h: number };

interface ImageAttachmentProps {
  value: string;
  onChange: (url: string) => void;
  onBusyChange?: (busy: boolean) => void;
  preparedImages?: string[];
  maxFileMB?: number;
}

const ASPECTS: { key: Aspect; label: string }[] = [
  { key: "original", label: "元の比率" },
  { key: "free", label: "自由" },
  { key: "1:1", label: "1:1" },
  { key: "16:9", label: "16:9" },
];

const MAX_OUT = 1600;
const UPLOAD_TIMEOUT_MS = 60000;

function aspectRatioOf(aspect: Aspect, iw: number, ih: number): number | null {
  if (aspect === "free") return null;
  if (aspect === "1:1") return 1;
  if (aspect === "16:9") return 16 / 9;
  return iw / ih;
}

export function ImageAttachment({ value, onChange, onBusyChange, preparedImages, maxFileMB = 15 }: ImageAttachmentProps) {
  const [previewUrl, setPreviewUrl] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [dragOver, setDragOver] = useState(false);
  const [preparedOpen, setPreparedOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const seqRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const pendingPayloadRef = useRef<Blob | File | null>(null);
  const sourceUrlRef = useRef(""); // 編集用に保持する画像URL（objectURL or remote）

  // ---- editor state ----
  const imgRef = useRef<HTMLImageElement | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);
  const [aspect, setAspect] = useState<Aspect>("original");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [freeRect, setFreeRect] = useState<Rect>({ x: 0, y: 0, w: 0, h: 0 });
  const dragRef = useRef<{ kind: "pan" | "move" | "resize"; x: number; y: number; panX: number; panY: number; rect: Rect } | null>(null);
  const [processing, setProcessing] = useState(false);

  const shownUrl = previewUrl || value;

  const setBusy = useCallback(
    (busy: boolean) => {
      onBusyChange?.(busy);
    },
    [onBusyChange]
  );

  // ---- upload ----
  const upload = useCallback(
    async (payload: Blob | File) => {
      const seq = ++seqRef.current;
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setStatus("uploading");
      setBusy(true);
      const timer = setTimeout(() => ctrl.abort(), UPLOAD_TIMEOUT_MS);
      try {
        const fd = new FormData();
        fd.append("file", payload);
        fd.append("upload_preset", process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || "default_preset");
        const res = await fetch(
          `https://api.cloudinary.com/v1_1/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload`,
          { method: "POST", body: fd, signal: ctrl.signal }
        );
        if (!res.ok) throw new Error(`upload failed: ${res.status}`);
        const data = (await res.json()) as { secure_url?: string };
        if (seq !== seqRef.current || !data.secure_url) return;
        onChange(data.secure_url);
        setStatus("idle");
      } catch (e) {
        if (seq === seqRef.current) setStatus("error");
      } finally {
        clearTimeout(timer);
        if (seq === seqRef.current) {
          setBusy(false);
          if (inputRef.current) inputRef.current.value = "";
        }
      }
    },
    [onChange, setBusy]
  );

  const attach = useCallback(
    (file: File | Blob) => {
      if (file instanceof File) {
        if (!file.type.startsWith("image/")) {
          toast.error("画像ファイルを選択してください。");
          return;
        }
        if (file.size > maxFileMB * 1024 * 1024) {
          toast.error(`画像は${maxFileMB}MB以下にしてください。`);
          return;
        }
      }
      const objectUrl = URL.createObjectURL(file);
      if (previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(objectUrl);
      sourceUrlRef.current = objectUrl;
      pendingPayloadRef.current = file;
      upload(file);
    },
    [previewUrl, maxFileMB, upload]
  );

  const detach = useCallback(() => {
    seqRef.current++;
    abortRef.current?.abort();
    if (previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    setPreviewUrl("");
    sourceUrlRef.current = "";
    pendingPayloadRef.current = null;
    setStatus("idle");
    setBusy(false);
    onChange("");
  }, [previewUrl, onChange, setBusy]);

  const retry = useCallback(() => {
    if (pendingPayloadRef.current) upload(pendingPayloadRef.current);
  }, [upload]);

  // ---- editor ----
  const openEditor = useCallback(async () => {
    const url = sourceUrlRef.current || value;
    if (!url) return;
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new window.Image();
        i.crossOrigin = "anonymous";
        i.onload = () => resolve(i);
        i.onerror = () => reject(new Error("load failed"));
        i.src = url;
      });
      imgRef.current = img;
      setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
      setAspect("original");
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setEditOpen(true);
    } catch {
      toast.error("画像の読み込みに失敗しました。");
    }
  }, [value]);

  useEffect(() => {
    if (!editOpen || !imgSize) return;
    const box = boxRef.current;
    if (!box) return;
    const { width: cw, height: ch } = box.getBoundingClientRect();
    const w = cw * 0.7;
    setFreeRect({ x: (cw - w) / 2, y: (ch - w * 0.6) / 2, w, h: w * 0.6 });
  }, [editOpen, imgSize]);

  const getFrame = useCallback((): Rect | null => {
    const box = boxRef.current;
    if (!box || !imgSize) return null;
    const { width: cw, height: ch } = box.getBoundingClientRect();
    if (aspect === "free") return freeRect;
    const ar = aspectRatioOf(aspect, imgSize.w, imgSize.h)!;
    let w = cw * 0.86;
    let h = w / ar;
    if (h > ch * 0.86) {
      h = ch * 0.86;
      w = h * ar;
    }
    return { x: (cw - w) / 2, y: (ch - h) / 2, w, h };
  }, [aspect, freeRect, imgSize]);

  const baseScale = useCallback(() => {
    const box = boxRef.current;
    if (!box || !imgSize) return 1;
    const { width: cw, height: ch } = box.getBoundingClientRect();
    return Math.min(cw / imgSize.w, ch / imgSize.h);
  }, [imgSize]);

  const clampPan = useCallback(
    (p: { x: number; y: number }, z: number): { x: number; y: number } => {
      const box = boxRef.current;
      const frame = getFrame();
      if (!box || !imgSize || !frame) return p;
      const { width: cw, height: ch } = box.getBoundingClientRect();
      const s = baseScale() * z;
      const drawnW = imgSize.w * s;
      const drawnH = imgSize.h * s;
      // 画像の左端・上端はフレームの左/上より左、右端・下端はフレームの右/下より右
      const minX = frame.x + frame.w - (cw / 2 + drawnW / 2);
      const maxX = frame.x - (cw / 2 - drawnW / 2);
      const minY = frame.y + frame.h - (ch / 2 + drawnH / 2);
      const maxY = frame.y - (ch / 2 - drawnH / 2);
      return {
        x: Math.min(Math.max(p.x, Math.min(minX, maxX)), Math.max(minX, maxX)),
        y: Math.min(Math.max(p.y, Math.min(minY, maxY)), Math.max(minY, maxY)),
      };
    },
    [baseScale, getFrame, imgSize]
  );

  const onPointerDown = (e: React.PointerEvent, kind: "pan" | "move" | "resize") => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { kind, x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y, rect: { ...freeRect } };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (d.kind === "pan") {
      setPan(clampPan({ x: d.panX + dx, y: d.panY + dy }, zoom));
    } else if (d.kind === "move") {
      const box = boxRef.current;
      if (!box) return;
      const { width: cw, height: ch } = box.getBoundingClientRect();
      setFreeRect({
        ...d.rect,
        x: Math.min(Math.max(d.rect.x + dx, 0), cw - d.rect.w),
        y: Math.min(Math.max(d.rect.y + dy, 0), ch - d.rect.h),
      });
    } else {
      const box = boxRef.current;
      if (!box) return;
      const { width: cw, height: ch } = box.getBoundingClientRect();
      setFreeRect({
        ...d.rect,
        w: Math.min(Math.max(d.rect.w + dx, 40), cw - d.rect.x),
        h: Math.min(Math.max(d.rect.h + dy, 40), ch - d.rect.y),
      });
    }
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  const applyEdit = useCallback(async () => {
    const img = imgRef.current;
    const box = boxRef.current;
    const frame = getFrame();
    if (!img || !box || !imgSize || !frame || processing) return;
    setProcessing(true);
    setBusy(true);
    try {
      const { width: cw, height: ch } = box.getBoundingClientRect();
      const s = baseScale() * zoom;
      const drawnW = imgSize.w * s;
      const drawnH = imgSize.h * s;
      const originX = cw / 2 + pan.x - drawnW / 2;
      const originY = ch / 2 + pan.y - drawnH / 2;
      let sx = (frame.x - originX) / s;
      let sy = (frame.y - originY) / s;
      let sw = frame.w / s;
      let sh = frame.h / s;
      sx = Math.max(0, Math.min(sx, imgSize.w));
      sy = Math.max(0, Math.min(sy, imgSize.h));
      sw = Math.max(1, Math.min(sw, imgSize.w - sx));
      sh = Math.max(1, Math.min(sh, imgSize.h - sy));

      const scaleOut = Math.min(1, MAX_OUT / Math.max(sw, sh));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(sw * scaleOut);
      canvas.height = Math.round(sh * scaleOut);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas unsupported");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // 切り抜き領域のみをソース矩形で描画（巨大画像の拡大描画を避ける）
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/jpeg", 0.85)
      );

      const objectUrl = URL.createObjectURL(blob);
      if (previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(objectUrl);
      sourceUrlRef.current = objectUrl;
      pendingPayloadRef.current = blob;
      setEditOpen(false);
      upload(blob);
    } catch (e) {
      console.error("crop apply error", e);
      toast.error("画像の編集に失敗しました。");
    } finally {
      setProcessing(false);
      setBusy(false);
    }
  }, [baseScale, getFrame, imgSize, pan, previewUrl, processing, setBusy, upload, zoom]);

  // ---- input handlers ----
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) attach(file);
  };

  // 貼り付けはフォーム内のどこをフォーカスしていても受け付ける（テキスト貼り付けはfilesが空なので無視される）
  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      const file = Array.from(e.clipboardData?.files ?? []).find((f) => f.type.startsWith("image/"));
      if (file) {
        e.preventDefault();
        attach(file);
      }
    };
    document.addEventListener("paste", handler);
    return () => document.removeEventListener("paste", handler);
  }, [attach]);

  const frame = editOpen ? getFrame() : null;
  const boxBase = imgSize && boxRef.current ? baseScale() : 1;
  const drawnW = imgSize ? imgSize.w * boxBase * zoom : 0;
  const drawnH = imgSize ? imgSize.h * boxBase * zoom : 0;

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) attach(f);
        }}
      />

      {shownUrl ? (
        <div className="space-y-2">
          <div
            className={`relative overflow-hidden rounded-lg border bg-slate-950/40 ${dragOver ? "border-emerald-400" : "border-gray-300"}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={shownUrl} alt="添付画像" className="max-h-72 w-full object-contain" />
            {status === "uploading" && (
              <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/50 text-sm font-bold text-white">
                <Loader2 className="h-4 w-4 animate-spin" />
                アップロード中…
              </div>
            )}
            {status === "error" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 text-sm font-bold text-white">
                アップロードに失敗しました
                <Button type="button" size="sm" variant="outline" onClick={retry} className="border-white/40 bg-transparent text-white">
                  <RefreshCw className="mr-1 h-3.5 w-3.5" />
                  再試行
                </Button>
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={openEditor} disabled={status === "uploading"} className="border-gray-300 bg-white text-gray-700 hover:bg-gray-100 hover:text-gray-900">
              <Crop className="mr-1 h-3.5 w-3.5" />
              編集
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={status === "uploading"} className="border-gray-300 bg-white text-gray-700 hover:bg-gray-100 hover:text-gray-900">
              差し替え
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={detach} disabled={status === "uploading"} className="border-gray-300 bg-white text-rose-600 hover:bg-rose-50 hover:text-rose-700">
              <X className="mr-1 h-3.5 w-3.5" />
              添付解除
            </Button>
          </div>
        </div>
      ) : (
        <div
          className={`flex h-36 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed text-sm transition-colors ${
            dragOver ? "border-emerald-400 bg-emerald-50/50 text-emerald-600" : "border-gray-300 text-gray-500 hover:border-gray-400"
          }`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          role="button"
          tabIndex={0}
        >
          <ImagePlus className="h-7 w-7" />
          <p className="font-bold">画像を添付</p>
          <p className="text-[11px]">タップして選択 / ドラッグ＆ドロップ / 貼り付け</p>
        </div>
      )}

      {preparedImages && preparedImages.length > 0 ? (
        <div className="mt-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setPreparedOpen(true)} className="border-gray-300 bg-white text-gray-700 hover:bg-gray-100 hover:text-gray-900">
            素材から選ぶ
          </Button>
        </div>
      ) : null}

      {/* 素材選択 */}
      <Dialog open={preparedOpen} onOpenChange={setPreparedOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>素材から選ぶ</DialogTitle>
          </DialogHeader>
          <div className="grid max-h-[50vh] grid-cols-3 gap-2 overflow-y-auto">
            {preparedImages?.map((src) => (
              <button
                key={src}
                type="button"
                className="overflow-hidden rounded-lg border hover:border-emerald-400"
                onClick={() => {
                  sourceUrlRef.current = src;
                  setPreviewUrl("");
                  setStatus("idle");
                  onChange(src);
                  setPreparedOpen(false);
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="h-20 w-full object-cover" />
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* 画像編集 */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="flex max-h-[95vh] w-[95vw] max-w-2xl flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>画像を編集</DialogTitle>
          </DialogHeader>

          <div className="flex flex-wrap gap-1.5">
            {ASPECTS.map((a) => (
              <button
                key={a.key}
                type="button"
                onClick={() => setAspect(a.key)}
                className={`rounded-full border px-3 py-1 text-xs font-bold ${
                  aspect === a.key ? "border-emerald-500 bg-emerald-600 text-white" : "border-gray-300 text-gray-600"
                }`}
              >
                {a.label}
              </button>
            ))}
          </div>

          <div
            ref={boxRef}
            className="relative mt-3 h-[280px] w-full touch-none select-none overflow-hidden rounded-lg bg-black sm:h-[340px]"
            onPointerDown={(e) => onPointerDown(e, "pan")}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {imgSize ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imgRef.current?.src}
                alt=""
                draggable={false}
                className="absolute left-1/2 top-1/2 max-w-none"
                style={{
                  width: drawnW,
                  height: drawnH,
                  transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px))`,
                }}
              />
            ) : null}
            {frame ? (
              <>
                <div className="pointer-events-none absolute inset-0 bg-black/50" />
                <div
                  className="absolute overflow-hidden"
                  style={{ left: frame.x, top: frame.y, width: frame.w, height: frame.h }}
                  onPointerDown={(e) => {
                    if (aspect === "free") {
                      e.stopPropagation();
                      onPointerDown(e, "move");
                    }
                  }}
                >
                  {imgSize ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={imgRef.current?.src}
                      alt=""
                      draggable={false}
                      className="absolute max-w-none"
                      style={{
                        width: drawnW,
                        height: drawnH,
                        left: boxRef.current ? boxRef.current.getBoundingClientRect().width / 2 + pan.x - drawnW / 2 - frame.x : 0,
                        top: boxRef.current ? boxRef.current.getBoundingClientRect().height / 2 + pan.y - drawnH / 2 - frame.y : 0,
                      }}
                    />
                  ) : null}
                  <div className="pointer-events-none absolute inset-0 border-2 border-white/90">
                    <div className="absolute inset-x-0 top-1/3 h-px bg-white/40" />
                    <div className="absolute inset-x-0 top-2/3 h-px bg-white/40" />
                    <div className="absolute inset-y-0 left-1/3 w-px bg-white/40" />
                    <div className="absolute inset-y-0 left-2/3 w-px bg-white/40" />
                  </div>
                </div>
                {aspect === "free" ? (
                  <div
                    className="absolute h-5 w-5 cursor-nwse-resize rounded-full border-2 border-white bg-emerald-500"
                    style={{ left: frame.x + frame.w - 10, top: frame.y + frame.h - 10 }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      onPointerDown(e, "resize");
                    }}
                  />
                ) : null}
              </>
            ) : null}
          </div>

          <div className="mt-3 flex items-center gap-2">
            <ZoomOut className="h-4 w-4 shrink-0 text-gray-500" />
            <input
              type="range"
              min={1}
              max={4}
              step={0.01}
              value={zoom}
              onChange={(e) => {
                const z = Number(e.target.value);
                setZoom(z);
                setPan((p) => clampPan(p, z));
              }}
              className="w-full accent-emerald-600"
            />
            <ZoomIn className="h-4 w-4 shrink-0 text-gray-500" />
          </div>

          <DialogFooter className="mt-3 flex flex-wrap gap-2 sm:justify-between">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setZoom(1);
                setPan({ x: 0, y: 0 });
                setAspect("original");
                const box = boxRef.current;
                if (box) {
                  const { width: cw, height: ch } = box.getBoundingClientRect();
                  const w = cw * 0.7;
                  setFreeRect({ x: (cw - w) / 2, y: (ch - w * 0.6) / 2, w, h: w * 0.6 });
                }
              }}
            >
              リセット
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setEditOpen(false)} disabled={processing}>
                キャンセル
              </Button>
              <Button type="button" size="sm" onClick={applyEdit} disabled={processing} className="bg-emerald-600 text-white hover:bg-emerald-700">
                {processing ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                適用
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
