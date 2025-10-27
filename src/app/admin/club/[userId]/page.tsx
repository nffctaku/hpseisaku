"use client";

import { useParams } from 'next/navigation';
import { ClubInfoForm } from "@/components/club-info-form";
import { DataMigration } from '@/components/data-migration';

export default function ClubAdminPage() {
  const params = useParams();
  const userId = params.userId as string;

  return (
    <div className="space-y-8">
            <div className="border-t border-gray-700 pt-8">
        <h1 className="text-3xl font-bold mb-2">クラブ情報管理</h1>
        <p className="text-gray-400 mb-6">あなたのクラブの公開情報を編集します。</p>
        <div className="max-w-2xl">
          <ClubInfoForm userId={userId} />
        </div>
      </div>

      <div className="border-t border-gray-700 pt-8">
         <DataMigration userId={userId} />
      </div>

    </div>
  );
}
