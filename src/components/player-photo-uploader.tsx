"use client";

import { useRef, useState, useEffect } from "react";
import { Loader2, UserSquare } from "lucide-react";
import Image from "next/image";
import { toast } from "sonner";
import { auth } from "@/lib/firebase";
import { logProPaywallView } from "@/lib/plan-analytics";
import { ProPaywall } from "@/components/pro-paywall";
import { PlanLimitBadge } from "@/components/plan-limit-badge";

interface PlayerPhotoUploaderProps {
  value: string;
  onChange: (url: string) => void;
  teamId?: string;
  season?: string;
  uid?: string;
}

export function PlayerPhotoUploader({ value, onChange, teamId, season, uid }: PlayerPhotoUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [limitReached, setLimitReached] = useState(false);
  const [photoCount, setPhotoCount] = useState(0);
  const [photoLimit, setPhotoLimit] = useState(20);
  const [plan, setPlan] = useState("free");

  useEffect(() => {
    if (!teamId || !uid) return;
    const check = async () => {
      try {
        const currentUser = auth.currentUser;
        if (!currentUser) return;
        const idToken = await currentUser.getIdToken();
        const res = await fetch(`/api/club/player-photos/check?teamId=${encodeURIComponent(teamId)}&season=${encodeURIComponent(season || "")}`, {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        const data = await res.json();
        if (res.ok) {
          setPhotoCount(data.currentCount ?? 0);
          setPhotoLimit(data.limit ?? 20);
          setPlan(data.plan ?? "free");
          setLimitReached(!data.allowed);
        }
      } catch (e) {
        console.error("[PlayerPhotoUploader] usage fetch failed", e);
      }
    };
    void check();
  }, [teamId, season, uid]);

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

    setLimitReached(false);

    const isNew = !value;
    if (isNew && teamId && uid) {
      try {
        const currentUser = auth.currentUser;
        if (!currentUser) throw new Error("ログインが必要です");
        const idToken = await currentUser.getIdToken();
        const res = await fetch(`/api/club/player-photos/check?teamId=${encodeURIComponent(teamId)}&season=${encodeURIComponent(season || "")}`, {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        const data = await res.json();
        if (res.ok) {
          setPhotoCount(data.currentCount ?? 0);
          setPhotoLimit(data.limit ?? 20);
          setPlan(data.plan ?? "free");
        }
        if (res.ok && data.allowed === false) {
          setLimitReached(true);
          if (uid) {
            await logProPaywallView({ uid, limitType: "player_photo", sourcePage: "admin/player-form" });
          }
          toast.error(data.error || "Freeプランでは選手画像は20人まで登録できます。");
          event.target.value = "";
          return;
        }
      } catch (e) {
        console.error("[PlayerPhotoUploader] limit check failed", e);
      }
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
    <div className="space-y-3">
      {uid && teamId && (
        <PlanLimitBadge
          plan={plan}
          current={photoCount}
          limit={photoLimit}
          label="選手画像"
          unit="人"
        />
      )}
      {limitReached && uid && (
        <ProPaywall
          uid={uid}
          limitType="player_photo"
          label="選手画像"
          current={photoCount}
          limit={photoLimit}
          proLabel="無制限"
          sourcePage="admin/player-form"
        />
      )}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading || limitReached}
          className="relative flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-[#334155] bg-[#172334] text-[#A8B5C8] transition hover:border-[#64748B] focus-visible:ring-2 focus-visible:ring-[#1FD760] focus-visible:outline-none disabled:opacity-50"
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
            disabled={uploading || limitReached}
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
    </div>
  );
}
