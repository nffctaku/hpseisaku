import type { ReactNode } from "react";
import { CareerDataBoundary } from "@/components/career-data-boundary";
export default function CompetitionsLayout({ children }: { children: ReactNode }) {
  return <CareerDataBoundary>{children}</CareerDataBoundary>;
}
