"use client";

import { useState } from 'react';
import { Loader2, UserSquare } from 'lucide-react';
import Image from 'next/image';
import { toast } from 'sonner';

interface PlayerPhotoUploaderProps {
  value: string;
  onChange: (url: string) => void;
}

export function PlayerPhotoUploader({ value, onChange }: PlayerPhotoUploaderProps) {
  const [uploading, setUploading] = useState(false);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files || event.target.files.length === 0) {
      return;
    }

    const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
    const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;
    if (!cloudName || !uploadPreset) {
      toast.error('画像アップロード設定（Cloudinary）が未設定です。');
      event.target.value = '';
      return;
    }

    const file = event.target.files[0];
    setUploading(true);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', uploadPreset);

    try {
      const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) {
        console.error('Cloudinary upload failed:', { status: response.status, data });
        toast.error('画像のアップロードに失敗しました。');
        return;
      }

      const photoUrl = data?.secure_url as string | undefined;

      if (photoUrl) {
        onChange(photoUrl);
        toast.success('画像をアップロードしました。');
      } else {
        console.error('Cloudinary response missing secure_url:', data);
        toast.error('画像URLの取得に失敗しました。');
      }
    } catch (error) {
      console.error('Error uploading player photo:', error);
      toast.error('画像のアップロード中にエラーが発生しました。');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  return (
    <div
      className="mt-2 mx-auto flex justify-center"
    >
      <div
        className="relative h-40 w-40 rounded-lg border border-dashed border-gray-300 flex items-center justify-center"
      >
        <input
          type="file"
          accept="image/*"
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
          onChange={handleFileChange}
          disabled={uploading}
        />
        {uploading ? (
          <Loader2 className="animate-spin" size={32} />
        ) : value ? (
          <Image src={value} alt="Player Photo" fill className="object-cover rounded-lg" />
        ) : (
          <div className="text-center">
            <UserSquare className="mx-auto h-10 w-10" />
            <p className="mt-2 text-xs">選手写真をアップロード</p>
          </div>
        )}
      </div>
    </div>
  );
}
