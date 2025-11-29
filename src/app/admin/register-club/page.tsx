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
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!clubId) {
      setError('クラブIDは必須です。');
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
        body: JSON.stringify({ clubId, ownerUid: user?.uid }),
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
    <div className="flex items-center justify-center min-h-screen bg-background text-gray-900">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>クラブ情報の初期登録</CardTitle>
          <CardDescription>
            公開用URLとして使用するクラブIDを登録してください。クラブ名やメインチームは後から設定できます。
          </CardDescription>
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
        </CardContent>
        <CardFooter className="flex flex-col items-start">
          {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
          <Button onClick={handleRegister} disabled={loading} className="w-full">
            {loading ? '登録中...' : '登録する'}
          </Button>
          <p className="mt-3 text-xs text-muted-foreground">
            ※ 自チームの登録は「チーム管理」から行い、HPに表示するメインチームの設定は「クラブ情報」画面で行ってください。
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
