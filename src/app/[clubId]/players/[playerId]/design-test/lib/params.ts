export function computeOverall(items: any[] | undefined): number {
  const vals = (items || [])
    .map((i) => {
      const v = (i as any)?.value;
      if (typeof v === "number" && Number.isFinite(v)) return v;
      if (typeof v === "string") {
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      }
      return null;
    })
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v))
    .map((v) => Math.max(0, Math.min(99, v)));

  if (vals.length === 0) return 0;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}
