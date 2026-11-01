import { shiftDay } from "@/lib/ingest-contract";

export function fillDays(from: string, to: string, rows: Array<{ day: string; count: number }>) {
  const counts = new Map(rows.map(row => [row.day, row.count]));
  const result: Array<{ day: string; count: number }> = [];
  for (let day = from; day <= to; day = shiftDay(day, 1)) result.push({ day, count: counts.get(day) ?? 0 });
  return result;
}

export function findSpikes(rows: Array<{ day: string; count: number }>): string[] {
  return rows.filter((row, index) => {
    if (index < 7) return false;
    const average = rows.slice(index - 7, index).reduce((sum, previous) => sum + previous.count, 0) / 7;
    return row.count >= 10 && row.count > Math.max(1, average) * 3;
  }).map(row => row.day);
}
