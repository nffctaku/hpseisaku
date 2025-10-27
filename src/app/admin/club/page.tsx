"use client";

import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminClubDashboardPage() {
  const { user, loading, clubProfileExists } = useAuth();

  if (loading) {
    return (
      <div className="container mx-auto py-10">
        <h1 className="text-3xl font-bold mb-6">クラブ管理ダッシュボード</h1>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-1/2" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-4 w-full mb-2" />
            <Skeleton className="h-4 w-3/4" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-10">
      <h1 className="text-3xl font-bold mb-6">クラブ管理ダッシュボード</h1>
      {clubProfileExists && user ? (
        <Card>
          <CardHeader>
            <CardTitle>{user.clubName || "名称未設定"}</CardTitle>
            <CardDescription>あなたのクラブ情報</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">クラブID</h3>
                <p className="font-mono bg-muted p-2 rounded-md text-sm">{user.clubId}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">オーナーUID</h3>
                <p className="font-mono bg-muted p-2 rounded-md text-sm">{user.uid}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <p className="text-muted-foreground">クラブ情報が見つかりません。先にクラブを登録してください。</p>
      )}
    </div>
  );
}
