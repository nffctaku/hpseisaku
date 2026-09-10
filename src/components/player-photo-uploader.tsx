"use client";

import { useRef, useState } from "react";
import { Loader2, UserSquare } from "lucide-react";
import Image from "next/image";
import { toast } from "sonner";

interface PlayerPhotoUploaderProps {
  value: string;
  onChange: (url: string) => void;
}

export function PlayerPhotoUploader({ value, onChange }: PlayerPhotoUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const handleClear = () => {
    if (!value) return;
    const ok = window.confirm("選手写真を削除しますか？");
    if (!ok) return;
    onChange("");
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files || event.target.files.length === 0) {
      return;
    }

    const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
    const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;
    if (!cloudName || !uploadPreset) {
      toast.error("画像アップロード設定（Cloudinary）が未設定です。");
      event.target.value = "";
      return;
    }

    const file = event.target.files[0];
    setUploading(true);
    setStatus("アップロード中…");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", uploadPreset);

    try {
      const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) {
        console.error("Cloudinary upload failed:", { status: response.status, data });
        toast.error("画像のアップロードに失敗しました。");
        setStatus("アップロードに失敗しました");
        return;
      }

      const photoUrl = data?.secure_url as string | undefined;
      if (photoUrl) {
        onChange(photoUrl);
        toast.success("画像をアップロードしました。");
      } else {
        console.error("Cloudinary response missing secure_url:", data);
        toast.error("画像URLの取得に失敗しました。");
        setStatus("画像URLの取得に失敗しました");
      }
    } catch (error) {
      console.error("Error uploading player photo:", error);
      toast.error("画像のアップロード中にエラーが発生しました。");
      setStatus("アップロード中にエラーが発生しました");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="relative flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-[#334155] bg-[#172334] text-[#A8B5C8] transition hover:border-[#64748B] focus-visible:ring-2 focus-visible:ring-[#1FD760] focus-visible:outline-none"
        aria-label={value ? "写真を変更" : "写真を追加"}
      >
        {uploading ? (
          <Loader2 className="h-6 w-6 animate-spin" />
        ) : value ? (
          <Image src={value} alt="選手写真" fill className="object-cover" />
        ) : (
          <UserSquare className="h-8 w-8" />
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={handleFileChange}
          disabled={uploading}
        />
      </button>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-[#F1F5F9]">
          {value ? "写真を変更" : "写真を追加"}
        </div>
        <div className="text-xs text-[#A8B5C8]">
          {uploading ? status : "タップしてファイルを選択"}
        </div>
        {value && !uploading ? (
          <button
            type="button"
            onClick={handleClear}
            className="mt-1 rounded text-xs text-[#FCA5A5] hover:text-red-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#FCA5A5]"
          >
            削除
          </button>
        ) : null}
      </div>
    </div>
  );
}
