"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, UploadCloud } from 'lucide-react';
import Image from 'next/image';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface ImageUploaderProps {
  value: string;
  onChange: (url: string) => void;
}

export function ImageUploader({ value, onChange }: ImageUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [cropOpen, setCropOpen] = useState(false);
  const [sourceDataUrl, setSourceDataUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [zoom, setZoom] = useState(1.2);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const CROP_W = 1200;
  const CROP_H = 480;

  const previewScale = useMemo(() => {
    const maxW = 560;
    return maxW / CROP_W;
  }, []);

  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

  const getBaseScale = () => {
    const img = imageRef.current;
    if (!img) return 1;
    return Math.max(CROP_W / img.naturalWidth, CROP_H / img.naturalHeight);
  };

  const clampPan = (next: { x: number; y: number }, nextZoom: number) => {
    const img = imageRef.current;
    if (!img) return next;
    const scale = getBaseScale() * nextZoom;
    const drawnW = img.naturalWidth * scale;
    const drawnH = img.naturalHeight * scale;
    const centeredDx = (CROP_W - drawnW) / 2;
    const centeredDy = (CROP_H - drawnH) / 2;
    const minPanX = (CROP_W - drawnW) - centeredDx;
    const maxPanX = 0 - centeredDx;
    const minPanY = (CROP_H - drawnH) - centeredDy;
    const maxPanY = 0 - centeredDy;
    return {
      x: clamp(next.x, minPanX, maxPanX),
      y: clamp(next.y, minPanY, maxPanY),
    };
  };

  const drawPreview = () => {
    const canvas = document.getElementById('partner-crop-preview') as HTMLCanvasElement | null;
    const img = imageRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const scale = getBaseScale() * zoom;
    const drawnW = img.naturalWidth * scale;
    const drawnH = img.naturalHeight * scale;
    const dx = (CROP_W - drawnW) / 2 + pan.x;
    const dy = (CROP_H - drawnH) / 2 + pan.y;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, dx * previewScale, dy * previewScale, drawnW * previewScale, drawnH * previewScale);
  };

  useEffect(() => {
    if (!cropOpen) return;
    drawPreview();
  }, [cropOpen, zoom, pan]);

  const uploadToCloudinary = async (file: Blob) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || 'default_preset');

    const response = await fetch(`https://api.cloudinary.com/v1_1/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error('Image upload failed');
    }

    return (await response.json()) as any;
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onerror = () => reject(new Error('file read failed'));
        reader.onload = () => resolve(String(reader.result || ''));
        reader.readAsDataURL(file);
      });

      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new window.Image();
        i.onload = () => resolve(i);
        i.onerror = () => reject(new Error('image load failed'));
        i.src = dataUrl;
      });

      imageRef.current = img;
      setSelectedFile(file);
      setSourceDataUrl(dataUrl);
      setZoom(1.2);
      setPan(clampPan({ x: 0, y: 0 }, 1.2));
      setCropOpen(true);
    } catch (error) {
      console.error('File read error:', error);
      toast.error('画像の読み込みに失敗しました。');
    }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!cropOpen) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging || !dragStartRef.current) return;
    const dx = (e.clientX - dragStartRef.current.x) / previewScale;
    const dy = (e.clientY - dragStartRef.current.y) / previewScale;
    const next = clampPan({ x: dragStartRef.current.panX + dx, y: dragStartRef.current.panY + dy }, zoom);
    setPan(next);
  };

  const handlePointerUp = () => {
    setDragging(false);
    dragStartRef.current = null;
  };

  const handleConfirmCrop = async () => {
    const img = imageRef.current;
    if (!img) return;

    setUploading(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = CROP_W;
      canvas.height = CROP_H;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('canvas not supported');

      const scale = getBaseScale() * zoom;
      const drawnW = img.naturalWidth * scale;
      const drawnH = img.naturalHeight * scale;
      const safePan = clampPan(pan, zoom);
      const dx = (CROP_W - drawnW) / 2 + safePan.x;
      const dy = (CROP_H - drawnH) / 2 + safePan.y;

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, dx, dy, drawnW, drawnH);

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png');
      });

      const fileNameBase = (selectedFile?.name || 'partner-logo').replace(/\.[^.]+$/, '');
      const croppedFile = new File([blob], `${fileNameBase}.png`, { type: 'image/png' });

      const data = await uploadToCloudinary(croppedFile);
      onChange(data.secure_url);
      toast.success('画像がアップロードされました。');
      setCropOpen(false);
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('画像のアップロードに失敗しました。');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <>
      <div className="relative w-full h-48 border-2 border-dashed border-gray-600 rounded-lg flex items-center justify-center text-gray-500 hover:border-gray-400 hover:text-gray-400 transition-colors cursor-pointer bg-muted/50">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
          onChange={handleFileChange}
          disabled={uploading}
        />
        {uploading ? (
          <Loader2 className="h-8 w-8 animate-spin" />
        ) : value ? (
          <Image src={value} alt="Uploaded image" layout="fill" className="object-contain rounded-lg p-1" />
        ) : (
          <div className="text-center">
            <UploadCloud className="mx-auto h-10 w-10" />
            <p className="mt-2 text-sm">画像を選択またはドラッグ＆ドロップ</p>
          </div>
        )}
      </div>

      <Dialog
        open={cropOpen}
        onOpenChange={(open) => {
          setCropOpen(open);
          if (!open) {
            setSourceDataUrl(null);
            setSelectedFile(null);
            imageRef.current = null;
            setDragging(false);
            dragStartRef.current = null;
            if (inputRef.current) inputRef.current.value = '';
          }
        }}
      >
        <DialogContent className="sm:max-w-[720px]">
          <DialogHeader>
            <DialogTitle>ロゴ画像をトリミング</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div
              className="relative w-full overflow-hidden rounded-md border bg-white"
              style={{ aspectRatio: `${CROP_W} / ${CROP_H}` }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onPointerLeave={handlePointerUp}
            >
              <canvas
                id="partner-crop-preview"
                width={Math.round(CROP_W * previewScale)}
                height={Math.round(CROP_H * previewScale)}
                className="block w-full h-full"
              />
            </div>

            <div className="flex items-center gap-3">
              <div className="text-xs text-muted-foreground whitespace-nowrap">拡大</div>
              <input
                type="range"
                min={1}
                max={3}
                step={0.01}
                value={zoom}
                onChange={(e) => {
                  const nextZoom = Number(e.target.value);
                  setZoom(nextZoom);
                  setPan((p) => clampPan(p, nextZoom));
                }}
                className="w-full"
              />
              <div className="text-xs text-muted-foreground w-10 text-right">{Math.round(zoom * 100)}%</div>
            </div>

            <div className="text-xs text-muted-foreground">画像をドラッグして位置を調整できます。</div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCropOpen(false)} disabled={uploading}>
              キャンセル
            </Button>
            <Button type="button" onClick={handleConfirmCrop} disabled={uploading}>
              {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              この範囲でアップロード
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}