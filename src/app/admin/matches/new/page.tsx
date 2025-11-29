"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function NewMatchPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/admin/competitions');
  }, [router]);

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="bg-white text-gray-900 rounded-lg shadow p-6 text-center space-y-2">
        <p>試合作成は大会管理ページから行ってください。</p>
        <p className="text-sm text-gray-500">自動的に大会管理ページへ移動します...</p>
      </div>
    </div>
  );
}
