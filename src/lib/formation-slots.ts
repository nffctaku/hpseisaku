export interface FormationSlot {
  label: string;
  x: number;
  y: number;
}

export const getFormationSlots = (formation: string): FormationSlot[] => {
  const lines = formation
    .split('-')
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v) && v > 0);
  const outfieldTotal = lines.reduce((sum, count) => sum + count, 0);
  const normalizedLines = outfieldTotal === 10 && lines.length > 0 ? lines : [4, 3, 3];
  const yByLineCount: Record<number, number[]> = {
    3: [61, 42, 23],
    4: [67, 49, 31, 13],
    5: [75, 59, 43, 27, 11],
  };
  const yList = yByLineCount[normalizedLines.length] || Array.from(
    { length: normalizedLines.length },
    (_, index) => 70 - index * (55 / Math.max(normalizedLines.length - 1, 1))
  );
  const slots: FormationSlot[] = [{ label: 'GK', x: 50, y: 85 }];

  normalizedLines.forEach((count, lineIndex) => {
    const y = yList[lineIndex] ?? 50;
    const label = lineIndex === 0 ? 'DF' : lineIndex === normalizedLines.length - 1 ? 'FW' : 'MF';
    const xMinByCount: Record<number, number> = { 2: 34, 3: 24, 4: 15, 5: 10 };
    const xMaxByCount: Record<number, number> = { 2: 66, 3: 76, 4: 85, 5: 90 };
    const xMin = xMinByCount[count] ?? 12;
    const xMax = xMaxByCount[count] ?? 88;
    const xs = count === 1
      ? [50]
      : Array.from({ length: count }, (_, index) => xMin + index * ((xMax - xMin) / (count - 1)));

    xs.forEach((x) => {
      slots.push({ label, x, y });
    });
  });

  return slots.slice(0, 11);
};
