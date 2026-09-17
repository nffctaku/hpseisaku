"use client";
import { Fragment, type ReactNode } from "react";
import { useCareer } from "@/contexts/CareerContext";

// Remount all nested record views when switching Careers, discarding old state.
export function CareerDataBoundary({ children }: { children: ReactNode }) {
  const { activeCareer, loading, error } = useCareer();
  if (loading) return <div role="status" className="p-6">記録を読み込んでいます…</div>;
  if (error) return <div role="alert" className="p-6">記録を取得できませんでした。</div>;
  if (!activeCareer?.clubUid || activeCareer.status === "deleted" || activeCareer.status === "creating") {
    return <div className="p-6">表示する記録を選択してください。</div>;
  }
  return <Fragment key={`${activeCareer.id}:${activeCareer.clubUid}`}>{children}</Fragment>;
}
