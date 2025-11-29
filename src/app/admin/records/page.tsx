"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RecordManagement } from '@/components/record-management';
import { PlayerStatsView } from '@/components/player-stats-view';

export default function TeamRecordsPage() {
  return (
    <div className="container mx-auto py-10">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">チーム記録</h1>
      </div>

      <Tabs defaultValue="competitions">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="competitions">大会成績</TabsTrigger>
          <TabsTrigger value="players">選手成績</TabsTrigger>
        </TabsList>
        <TabsContent value="competitions">
          <RecordManagement />
        </TabsContent>
        <TabsContent value="players">
          <div className="py-6">
            <PlayerStatsView />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
