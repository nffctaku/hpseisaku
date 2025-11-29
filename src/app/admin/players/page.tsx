"use client";

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { PlayerManagement } from '@/components/player-management';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Team {
  id: string;
  name: string;
}

export default function PlayersAdminPage() {
  const { user, loading } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const [fetchingTeams, setFetchingTeams] = useState(false);

  useEffect(() => {
    const fetchTeams = async () => {
      if (!user) return;
      setFetchingTeams(true);
      try {
        const teamsColRef = collection(db, `clubs/${user.uid}/teams`);
        const snap = await getDocs(teamsColRef);
        const list: Team[] = snap.docs.map((doc) => ({
          id: doc.id,
          name: (doc.data().name as string) || doc.id,
        }));
        setTeams(list);
      } catch (error) {
        console.error('Failed to fetch teams: ', error);
      } finally {
        setFetchingTeams(false);
      }
    };

    fetchTeams();
  }, [user]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container mx-auto py-10 text-gray-900">
        <h1 className="text-3xl font-bold mb-6">選手管理</h1>
        <div className="bg-white rounded-lg p-6">
          <p className="text-gray-900">ログインが必要です。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-10 text-gray-900">
      <h1 className="text-3xl font-bold mb-6">選手管理</h1>

      <div className="bg-white rounded-lg p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4">クラブを選択</h2>
        {fetchingTeams ? (
          <div className="flex items-center space-x-2 text-gray-900">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>クラブを読み込み中...</span>
          </div>
        ) : teams.length === 0 ? (
          <p className="text-gray-900">クラブ（チーム）が登録されていません。先にクラブ情報を登録してください。</p>
        ) : (
          <div className="max-w-xs">
            <Select
              value={selectedTeamId}
              onValueChange={(value) => setSelectedTeamId(value)}
            >
              <SelectTrigger className="bg-white text-gray-900">
                <SelectValue placeholder="クラブを選択" />
              </SelectTrigger>
              <SelectContent>
                {teams.map((team) => (
                  <SelectItem key={team.id} value={team.id}>
                    {team.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {selectedTeamId && (
        <div className="bg-white rounded-lg p-6">
          <PlayerManagement teamId={selectedTeamId} />
        </div>
      )}
    </div>
  );
}
