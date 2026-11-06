"use client";

import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from "react";
import { useAuth, type UserProfile } from "@/contexts/AuthContext";
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

  const buildInitialCareer = useCallback((profile: UserProfile): Career | null => {
    if (!profile.activeCareerId || !profile.clubUid) return null;
    return {
      id: profile.activeCareerId,
      ownerId: profile.uid,
      clubUid: profile.clubUid,
      name: profile.clubName || profile.activeCareerId,
      gameTitle: "FC26",
      clubName: profile.clubName || "",
      clubId: profile.clubId || null,
      clubLogo: profile.logoUrl || null,
      startSeason: null,
      latestSeason: null,
      seasonCount: 0,
      isPublic: false,
      status: "active",
      createdAt: undefined,
      updatedAt: undefined,
    };
  }, []);

  const load = useCallback(async (uid: string, silent = false) => {
    const t0 = performance.now();
    console.log(`[CareerContext] load start uid=${uid}, silent=${silent}, t=${Math.round(t0)}`);
    if (!silent) setLoading(true);
    setError(null);
    let list: Career[] = [];
    let resolved: Career | null = null;
    try {
      const { careers: fetched, activeCareerId } = await getCareerContextData();
      list = fetched;
      if (list.length === 0) {
        const defaulted = await ensureDefaultCareer(uid);
        setCareers([defaulted]);
        setActiveCareer(defaulted);
        resolved = defaulted;
        return;
      }
      setCareers(list);

      const nonDeleted = list.filter((c) => c.status !== "deleted");
      resolved = nonDeleted.find((c) => c.id === activeCareerId) || nonDeleted[0] || null;
      setActiveCareer(resolved);
    } catch (e: any) {
      console.error("[CareerContext] load failed", e);
      setError(e?.message || "Career一覧の取得に失敗しました");
    } finally {
      if (!silent) setLoading(false);
      console.log(`[CareerContext] load done: ${Math.round(performance.now() - t0)}ms, careers=${list.length}, active=${resolved?.id ?? "none"}`);
    }
  }, []);

  useEffect(() => {
    console.log(`[CareerContext] effect triggered: t=${Math.round(performance.now())}ms, hasUser=${!!user?.uid}, activeCareerId=${user?.activeCareerId ?? ""}, clubUid=${user?.clubUid ?? ""}`);
    if (!user?.uid) {
      setCareers([]);
      setActiveCareer(null);
      setLoading(false);
      return;
    }
    const uid = user.uid;
    const initial = buildInitialCareer(user as UserProfile);
    const silent = !!initial;
    if (initial) {
      console.log(`[CareerContext] active career ready from AuthContext: t=${Math.round(performance.now())}ms`, { id: initial.id, clubUid: initial.clubUid });
      setCareers([initial]);
      setActiveCareer(initial);
      setLoading(false);
      setError(null);
    }

    let unsub: (() => void) | null = null;
    let cancelled = false;

    void (async () => {
      try {
        await load(uid, silent);
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
