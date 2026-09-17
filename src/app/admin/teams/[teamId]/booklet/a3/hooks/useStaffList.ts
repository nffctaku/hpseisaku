import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs } from "firebase/firestore";
import type { StaffDoc } from "../types";

export function useStaffList(clubUid: string | null, teamId: string) {
  const [staffList, setStaffList] = useState<StaffDoc[]>([]);

  useEffect(() => {
    let cancelled = false;
    setStaffList([]);
    const run = async () => {
      if (!clubUid || !teamId) {
        return;
      }
      try {
        const snap = await getDocs(collection(db, `clubs/${clubUid}/teams/${teamId}/staff`));
        const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as StaffDoc));
        if (!cancelled) setStaffList(list);
      } catch (e) {
        console.warn("[A3Editor] failed to load staff list", e);
        if (!cancelled) setStaffList([]);
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [clubUid, teamId]);

  return { staffList };
}
