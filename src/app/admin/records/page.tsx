"use client";

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RecordManagement } from '@/components/record-management';

export default function TeamRecordsPage() {
  const [selectedSeason, setSelectedSeason] = useState('2024-2025');

  return (
    <div className="container mx-auto py-10">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">チーム記録</h1>
        <Select value={selectedSeason} onValueChange={setSelectedSeason}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="シーズン選択" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="2024-2025">2024-2025</SelectItem>
            <SelectItem value="2023-2024">2023-2024</SelectItem>
            <SelectItem value="2022-2023">2022-2023</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="competitions">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="competitions">大会成績</TabsTrigger>
          <TabsTrigger value="players">選手成績</TabsTrigger>
        </TabsList>
        <TabsContent value="competitions">
          <RecordManagement season={selectedSeason} />
        </TabsContent>
        <TabsContent value="players">
          <div className="py-6">
            <p className="text-center text-muted-foreground">選手成績はここに表示されます。</p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
