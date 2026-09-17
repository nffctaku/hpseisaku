"use client";

import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import type { Career, CareerInput } from "@/lib/career";
import {
  getCareerContextData,
  getCareer,
  setActiveCareerId,
  ensureDefaultCareer,
  createCareer,
} from "@/lib/career";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";

interface CareerContextType {
  activeCareer: Career | null;
  careers: Career[];
  loading: boolean;
  error: string | null;
  switchCareer: (careerId: string) => Promise<void>;
  createAndSwitchCareer: (input: CareerInput) => Promise<Career>;
  refreshCareers: () => Promise<void>;
}

const CareerContext = createContext<CareerContextType>({
  activeCareer: null,
  careers: [],
  loading: true,
  error: null,
  switchCareer: async () => {},
  createAndSwitchCareer: async () => ({ id: "", ownerId: "", clubUid: "", name: "", gameTitle: "", clubName: "", seasonCount: 0, isPublic: false }),
  refreshCareers: async () => {},
});

export function CareerProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [careers, setCareers] = useState<Career[]>([]);
  const [activeCareer, setActiveCareer] = useState<Career | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const careersRef = useRef<Career[]>([]);

  useEffect(() => {
    careersRef.current = careers;
  }, [careers]);

  const load = useCallback(async (uid: string) => {
    setLoading(true);
    setError(null);
    try {
      const { careers: list, activeCareerId } = await getCareerContextData();
      if (list.length === 0) {
        const defaulted = await ensureDefaultCareer(uid);
        setCareers([defaulted]);
        setActiveCareer(defaulted);
        return;
      }
      setCareers(list);

      const nonDeleted = list.filter((c) => c.status !== "deleted");
      const resolved = nonDeleted.find((c) => c.id === activeCareerId) || nonDeleted[0] || null;
      setActiveCareer(resolved);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user?.uid) {
      setCareers([]);
      setActiveCareer(null);
      setLoading(false);
      return;
    }
    const uid = user.uid;

    let unsub: (() => void) | null = null;
    let cancelled = false;

    void (async () => {
      try {
        await load(uid);
      } catch (e: any) {
        console.error("[CareerContext] initial load failed", e);
        setError(e?.message || "Career一覧の取得に失敗しました");
      }
      if (cancelled) return;
      // Listen for activeCareerId changes from other sessions
      unsub = onSnapshot(doc(db, "users", uid), (snap) => {
        const data = snap.data() as Record<string, unknown> | undefined;
        const nextActiveId = data?.activeCareerId;
        if (typeof nextActiveId === "string") {
          const current = careersRef.current.find((c) => c.id === nextActiveId) || null;
          if (current) {
            setActiveCareer(current);
          } else {
            getCareer(nextActiveId).then((c) => {
              if (c) setActiveCareer(c);
            });
          }
        }
      });
    })();

    return () => {
      cancelled = true;
      if (unsub) unsub();
    };
  }, [user?.uid, load]);

  const switchCareer = useCallback(
    async (careerId: string) => {
      if (!user?.uid) return;
      const next = careers.find((c) => c.id === careerId) || (await getCareer(careerId));
      if (!next) return;
      await setActiveCareerId(user.uid, careerId);
      setActiveCareer(next);
    },
    [careers, user?.uid]
  );

  const createAndSwitchCareer = useCallback(
    async (input: CareerInput) => {
      if (!user?.uid) throw new Error("Not authenticated");
      const created = await createCareer(user.uid, input);
      const nextCareers = [...careers, created];
      setCareers(nextCareers);
      setActiveCareer(created);
      return created;
    },
    [careers, user?.uid]
  );

  const refreshCareers = useCallback(async () => {
    if (!user?.uid) return;
    await load(user.uid);
  }, [load, user?.uid]);

  return (
    <CareerContext.Provider
      value={{ activeCareer, careers, loading, error, switchCareer, createAndSwitchCareer, refreshCareers }}
    >
      {children}
    </CareerContext.Provider>
  );
}

export function useCareer() {
  return useContext(CareerContext);
}
