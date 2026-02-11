"use client";

import { useState } from 'react';
import { Loader2, UploadCloud } from 'lucide-react';
import Image from 'next/image';
import { toast } from 'sonner';

interface ClubEmblemUploaderProps {
  value: string;
  onChange: (url: string) => void;
}

export function ClubEmblemUploader({ value, onChange }: ClubEmblemUploaderProps) {
  const [uploading, setUploading] = useState(false);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files || event.target.files.length === 0) {
      return;
    }

    const file = event.target.files[0];
    setUploading(true);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET!);

    try {
      const response = await fetch(`https://api.cloudinary.com/v1_1/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      const emblemUrl = data.secure_url;

      if (emblemUrl) {
        onChange(emblemUrl);
      }
    } catch (error) {
      console.error('Error uploading emblem:', error);
toast.error('エンブレムのアップロードに失敗しました。');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="relative w-40 h-40 border-2 border-dashed border-gray-600 rounded-lg flex items-center justify-center text-gray-500 hover:border-gray-400 hover:text-gray-400 transition-colors cursor-pointer">
      <input
        type="file"
        accept="image/*"
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
        onChange={handleFileChange}
        disabled={uploading}
      />
      {uploading ? (
        <Loader2 className="animate-spin" size={48} />
      ) : value ? (
        <Image src={value} alt="Club Emblem" fill className="object-contain rounded-lg" />
      ) : (
        <div className="text-center">
          <UploadCloud className="mx-auto h-12 w-12" />
          <p className="mt-2 text-sm">エンブレムをアップロード</p>
        </div>
      )}
    </div>
  );
}
