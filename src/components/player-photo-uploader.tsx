"use client";

import { useState } from 'react';
import { Loader2, UserSquare } from 'lucide-react';
import Image from 'next/image';

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
      const photoUrl = data.secure_url;

      if (photoUrl) {
        onChange(photoUrl);
      }
    } catch (error) {
      console.error('Error uploading player photo:', error);
    } finally {
      setUploading(false);
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
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
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
