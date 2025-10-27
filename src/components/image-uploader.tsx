"use client";

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, UploadCloud } from 'lucide-react';
import Image from 'next/image';

interface ImageUploaderProps {
  value: string;
  onChange: (url: string) => void;
}

export function ImageUploader({ value, onChange }: ImageUploaderProps) {
  const [uploading, setUploading] = useState(false);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || 'default_preset');

    try {
      const response = await fetch(`https://api.cloudinary.com/v1_1/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Image upload failed');
      }

      const data = await response.json();
      onChange(data.secure_url);
      toast.success('画像がアップロードされました。');
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('画像のアップロードに失敗しました。');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="relative w-full h-48 border-2 border-dashed border-gray-600 rounded-lg flex items-center justify-center text-gray-500 hover:border-gray-400 hover:text-gray-400 transition-colors cursor-pointer bg-muted/50">
      <input
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
  );
}