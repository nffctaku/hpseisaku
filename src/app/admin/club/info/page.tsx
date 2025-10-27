"use client";

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { ClubEmblemUploader } from '@/components/club-emblem-uploader';

export default function ClubInfoPage() {
  const { user, refreshUserProfile } = useAuth();
  const [clubName, setClubName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      setClubName(user.clubName || '');
      setLogoUrl(user.logoUrl || '');
    }
  }, [user]);

  const handleUpdate = async () => {
    if (!user || !auth.currentUser) {
      toast.error('ログインしていません。');
      return;
    }

    setLoading(true);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const updateResponse = await fetch('/api/club/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({ clubName, logoUrl }),
      });

      if (!updateResponse.ok) {
        const data = await updateResponse.json();
        throw new Error(data.message || '更新に失敗しました。');
      }

      toast.success('クラブ情報が更新されました。');
      
      if (refreshUserProfile) {
        await refreshUserProfile();
      }

    } catch (error: any) {
      toast.error(error.message || '更新中にエラーが発生しました。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto py-10">
      <h1 className="text-3xl font-bold mb-6">クラブ情報編集</h1>
      <Card>
        <CardHeader>
          <CardTitle>クラブ設定</CardTitle>
          <CardDescription>クラブ名とロゴを編集します。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="clubName">クラブ名</Label>
            <Input 
              id="clubName" 
              value={clubName}
              onChange={(e) => setClubName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>ロゴ画像</Label>
            <ClubEmblemUploader 
              value={logoUrl}
              onChange={setLogoUrl}
            />
          </div>
        </CardContent>
        <CardFooter>
          <Button onClick={handleUpdate} disabled={loading}>
            {loading ? '更新中...' : '更新する'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
