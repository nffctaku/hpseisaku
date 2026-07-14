'use client';

interface SeasonDropdownProps {
  seasons: string[];
  activeSeason: string;
}

export function SeasonDropdown({ seasons, activeSeason }: SeasonDropdownProps) {
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const season = e.target.value;
    const url = new URL(window.location.href);
    url.searchParams.set('season', season);
    window.location.href = url.toString();
  };

  return (
    <select
      value={activeSeason}
      onChange={handleChange}
      style={{
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: '11px',
        padding: '8px 16px',
        border: '1px solid #0B141033',
        background: 'transparent',
        color: '#0B1410',
        cursor: 'pointer'
      }}
    >
      {seasons.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );
}
