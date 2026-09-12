import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const DEFAULT_CLUB_COLOR = '#dc143c';

export function parseColorToRgb(color: string): { r: number; g: number; b: number } | null {
  const input = color.trim();

  // hex: #RGB or #RRGGBB
  if (input.startsWith('#')) {
    let hex = input.slice(1);
    if (hex.length === 3) {
      hex = hex.split('').map((c) => c + c).join('');
    }
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      if ([r, g, b].every((n) => !Number.isNaN(n))) {
        return { r, g, b };
      }
    }
    return null;
  }

  // rgb/rgba(r, g, b, ?)
  const match = input.match(/^rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (match) {
    const r = Number(match[1]);
    const g = Number(match[2]);
    const b = Number(match[3]);
    return { r, g, b };
  }

  return null;
}

const LUMINANCE_THRESHOLD = 160 / 255; // 0.627

export function isColorDark(color: string): boolean {
  const rgb = parseColorToRgb(color);
  if (!rgb) return false;
  const luminance = 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
  return luminance <= LUMINANCE_THRESHOLD * 255;
}

export function getContrastTextColor(color: string): '#000000' | '#FFFFFF' {
  return isColorDark(color) ? '#FFFFFF' : '#000000';
}

export function lightenColor(hex: string, percent: number): string {
  const rgb = parseColorToRgb(hex);
  if (!rgb) return '#FFF5E6'; // fallback to default light beige

  const amount = Math.round(2.55 * percent);
  const r = Math.min(255, rgb.r + amount);
  const g = Math.min(255, rgb.g + amount);
  const b = Math.min(255, rgb.b + amount);

  return `#${(1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1)}`;
}

export function getClubColor(source: Record<string, unknown> | null | undefined): string | undefined {
  if (!source || typeof source !== 'object') return undefined;
  const design = source.design as Record<string, unknown> | undefined;
  const profile = source.profile as Record<string, unknown> | undefined;
  const data = source.data as Record<string, unknown> | undefined;
  const candidates = [
    source.homeBgColor,
    source.clubColor,
    source.primaryColor,
    source.themeColor,
    source.mainColor,
    design?.clubColor,
    design?.primaryColor,
    design?.homeBgColor,
    profile?.clubColor,
    profile?.homeBgColor,
    profile?.primaryColor,
    data?.clubColor,
    data?.homeBgColor,
    data?.primaryColor,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim().length > 0) return c.trim();
  }
  return undefined;
}
