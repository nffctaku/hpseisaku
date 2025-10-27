"use client";

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { collection, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

interface Competition {
  id: string;
  name: string;
}

interface Round {
  id: string;
  name: string;
}

interface Team {
  id: string;
  name: string;
}

export default function NewMatchPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedCompetition, setSelectedCompetition] = useState('');
  const [selectedRound, setSelectedRound] = useState('');
  const [selectedHomeTeam, setSelectedHomeTeam] = useState('');
  const [selectedAwayTeam, setSelectedAwayTeam] = useState('');
  const [matchDate, setMatchDate] = useState('');
  const [matchTime, setMatchTime] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      try {
        const compsSnapshot = await getDocs(collection(db, `clubs/${user.uid}/competitions`));
        setCompetitions(compsSnapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name })));

        const teamsSnapshot = await getDocs(collection(db, `clubs/${user.uid}/teams`));
        setTeams(teamsSnapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name })));
      } catch (error) {
        toast.error('データの読み込みに失敗しました。');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [user]);

  useEffect(() => {
    if (!user || !selectedCompetition) {
      setRounds([]);
      return;
    }

    const fetchRounds = async () => {
      const roundsSnapshot = await getDocs(collection(db, `clubs/${user.uid}/competitions/${selectedCompetition}/rounds`));
      setRounds(roundsSnapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name })));
    };
    fetchRounds();
  }, [user, selectedCompetition]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedCompetition || !selectedRound || !selectedHomeTeam || !selectedAwayTeam || !matchDate) {
      toast.error('すべての必須項目を入力してください。');
      return;
    }

    try {
      await addDoc(collection(db, `clubs/${user.uid}/competitions/${selectedCompetition}/rounds/${selectedRound}/matches`), {
        homeTeam: selectedHomeTeam,
        awayTeam: selectedAwayTeam,
        matchDate,
        matchTime,
        createdAt: serverTimestamp(),
      });
      toast.success('試合が正常に追加されました。');
      router.push('/admin/matches');
    } catch (error) {
      toast.error('試合の追加に失敗しました。');
      console.error(error);
    }
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">新しい試合を追加</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label>大会</label>
          <select value={selectedCompetition} onChange={e => setSelectedCompetition(e.target.value)} required className="w-full p-2 border rounded">
            <option value="">選択してください</option>
            {competitions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label>節</label>
          <select value={selectedRound} onChange={e => setSelectedRound(e.target.value)} required disabled={!selectedCompetition} className="w-full p-2 border rounded">
            <option value="">選択してください</option>
            {rounds.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <div>
          <label>試合日</label>
          <input type="date" value={matchDate} onChange={e => setMatchDate(e.target.value)} required className="w-full p-2 border rounded" />
        </div>
        <div>
          <label>試合時間</label>
          <input type="time" value={matchTime} onChange={e => setMatchTime(e.target.value)} className="w-full p-2 border rounded" />
        </div>
        <div>
          <label>ホームチーム</label>
          <select value={selectedHomeTeam} onChange={e => setSelectedHomeTeam(e.target.value)} required className="w-full p-2 border rounded">
            <option value="">選択してください</option>
            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div>
          <label>アウェイチーム</label>
          <select value={selectedAwayTeam} onChange={e => setSelectedAwayTeam(e.target.value)} required className="w-full p-2 border rounded">
            <option value="">選択してください</option>
            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <button type="submit" className="bg-primary text-primary-foreground px-4 py-2 rounded">試合を追加</button>
      </form>
    </div>
  );
}
