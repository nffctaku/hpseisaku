"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RecordManagement } from '@/components/record-management';

export default function TeamRecordsPage() {
  return (
    <div className="container mx-auto py-10">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">大会記録</h1>
      </div>

      <Tabs defaultValue="competitions">
        <TabsList className="grid w-full grid-cols-1">
          <TabsTrigger value="competitions">大会成績</TabsTrigger>
        </TabsList>
        <TabsContent value="competitions">
          <RecordManagement />
        </TabsContent>
      </Tabs>
    </div>
  );
}
