"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';

export default function RegisterClubPage() {
  const { user, refreshUserProfile } = useAuth();
  const router = useRouter();
  const [clubId, setClubId] = useState('');
  const [clubName, setClubName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!clubId || !clubName) {
      setError('クラブIDとチーム名は必須です。');
      return;
    }
    if (!/^[a-z0-9-]+$/.test(clubId)) {
        setError('クラブIDは半角英数字とハイフンのみ使用できます。');
        return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/club/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clubId, clubName, ownerUid: user?.uid }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || '登録に失敗しました。');
      }

      // AuthContextのユーザー情報を更新
      if (refreshUserProfile) {
        await refreshUserProfile();
      }
      
      // 登録成功後、管理ダッシュボードなどにリダイレクト
      router.push('/admin/club');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>クラブ情報の初期登録</CardTitle>
          <CardDescription>あなたのクラブ情報を登録してください。クラブIDは後から変更できません。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="clubId">クラブID</Label>
            <Input 
              id="clubId" 
              placeholder="例: real-madrid" 
              value={clubId}
              onChange={(e) => setClubId(e.target.value.toLowerCase())}
              required 
            />
            <p className="text-xs text-muted-foreground">URLに使用されます (半角英数字とハイフンのみ)</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="clubName">チーム名</Label>
            <Input 
              id="clubName" 
              placeholder="例: レアル・マドリード" 
              value={clubName}
              onChange={(e) => setClubName(e.target.value)}
              required 
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col items-start">
          {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
          <Button onClick={handleRegister} disabled={loading} className="w-full">
            {loading ? '登録中...' : '登録する'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
