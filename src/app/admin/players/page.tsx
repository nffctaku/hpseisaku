"use client";

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { PlayerManagement } from '@/components/player-management';
import { Loader2 } from 'lucide-react';

interface ClubData {
  myTeam?: string; // 自チームIDのフィールド名を仮に myTeam とします
}

import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function PlayersAdminPage() {
  return (
    <div className="container mx-auto py-10">
      <h1 className="text-3xl font-bold mb-6">選手管理</h1>
      <div className="bg-card p-6 rounded-lg text-center">
        <p className="text-muted-foreground mb-4">選手は各チームに所属します。選手を管理するには、まずチームを選択してください。</p>
        <Link href="/admin/teams">
          <Button>チーム一覧へ</Button>
        </Link>
      </div>
    </div>
  );
}
