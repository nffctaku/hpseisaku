export interface Position {
  id: string;
  label: string;
  coordinates: { x: number; y: number };
}

export interface Formation {
  name: string;
  positions: Position[];
}

export const formations: Formation[] = [
  {
    name: '4-2-3-1',
    positions: [
      { id: 'GK', label: 'GK', coordinates: { x: 50, y: 5 } },
      { id: 'RB', label: 'RB', coordinates: { x: 85, y: 25 } },
      { id: 'RCB', label: 'CB', coordinates: { x: 65, y: 25 } },
      { id: 'LCB', label: 'CB', coordinates: { x: 35, y: 25 } },
      { id: 'LB', label: 'LB', coordinates: { x: 15, y: 25 } },
      { id: 'RDM', label: 'DM', coordinates: { x: 65, y: 45 } },
      { id: 'LDM', label: 'DM', coordinates: { x: 35, y: 45 } },
      { id: 'RAM', label: 'AM', coordinates: { x: 80, y: 65 } },
      { id: 'CAM', label: 'AM', coordinates: { x: 50, y: 65 } },
      { id: 'LAM', label: 'AM', coordinates: { x: 20, y: 65 } },
      { id: 'ST', label: 'ST', coordinates: { x: 50, y: 85 } },
    ],
  },
  {
    name: '4-1-2-3',
    positions: [
      { id: 'GK', label: 'GK', coordinates: { x: 50, y: 5 } },
      { id: 'RB', label: 'RB', coordinates: { x: 85, y: 25 } },
      { id: 'RCB', label: 'CB', coordinates: { x: 65, y: 25 } },
      { id: 'LCB', label: 'CB', coordinates: { x: 35, y: 25 } },
      { id: 'LB', label: 'LB', coordinates: { x: 15, y: 25 } },
      { id: 'DM', label: 'DM', coordinates: { x: 50, y: 40 } },
      { id: 'RCM', label: 'CM', coordinates: { x: 70, y: 55 } },
      { id: 'LCM', label: 'CM', coordinates: { x: 30, y: 55 } },
      { id: 'RW', label: 'WG', coordinates: { x: 85, y: 75 } },
      { id: 'ST', label: 'ST', coordinates: { x: 50, y: 85 } },
      { id: 'LW', label: 'WG', coordinates: { x: 15, y: 75 } },
    ],
  },
  {
    name: '4-4-2',
    positions: [
      { id: 'GK', label: 'GK', coordinates: { x: 50, y: 5 } },
      { id: 'RB', label: 'RB', coordinates: { x: 85, y: 25 } },
      { id: 'RCB', label: 'CB', coordinates: { x: 65, y: 25 } },
      { id: 'LCB', label: 'CB', coordinates: { x: 35, y: 25 } },
      { id: 'LB', label: 'LB', coordinates: { x: 15, y: 25 } },
      { id: 'RM', label: 'MF', coordinates: { x: 85, y: 55 } },
      { id: 'RCM', label: 'MF', coordinates: { x: 65, y: 55 } },
      { id: 'LCM', label: 'MF', coordinates: { x: 35, y: 55 } },
      { id: 'LM', label: 'MF', coordinates: { x: 15, y: 55 } },
      { id: 'RST', label: 'ST', coordinates: { x: 60, y: 85 } },
      { id: 'LST', label: 'ST', coordinates: { x: 40, y: 85 } },
    ],
  },
  {
    name: '3-4-2-1',
    positions: [
      { id: 'GK', label: 'GK', coordinates: { x: 50, y: 5 } },
      { id: 'RCB', label: 'CB', coordinates: { x: 75, y: 25 } },
      { id: 'CB', label: 'CB', coordinates: { x: 50, y: 25 } },
      { id: 'LCB', label: 'CB', coordinates: { x: 25, y: 25 } },
      { id: 'RM', label: 'WB', coordinates: { x: 85, y: 50 } },
      { id: 'RCM', label: 'CM', coordinates: { x: 65, y: 50 } },
      { id: 'LCM', label: 'CM', coordinates: { x: 35, y: 50 } },
      { id: 'LM', label: 'WB', coordinates: { x: 15, y: 50 } },
      { id: 'RAM', label: 'AM', coordinates: { x: 65, y: 75 } },
      { id: 'LAM', label: 'AM', coordinates: { x: 35, y: 75 } },
      { id: 'ST', label: 'ST', coordinates: { x: 50, y: 90 } },
    ],
  },
  {
    name: '3-5-2',
    positions: [
      { id: 'GK', label: 'GK', coordinates: { x: 50, y: 5 } },
      { id: 'RCB', label: 'CB', coordinates: { x: 75, y: 25 } },
      { id: 'CB', label: 'CB', coordinates: { x: 50, y: 25 } },
      { id: 'LCB', label: 'CB', coordinates: { x: 25, y: 25 } },
      { id: 'RWB', label: 'WB', coordinates: { x: 90, y: 50 } },
      { id: 'RCM', label: 'CM', coordinates: { x: 70, y: 55 } },
      { id: 'CDM', label: 'DM', coordinates: { x: 50, y: 45 } },
      { id: 'LCM', label: 'CM', coordinates: { x: 30, y: 55 } },
      { id: 'LWB', label: 'WB', coordinates: { x: 10, y: 50 } },
      { id: 'RST', label: 'ST', coordinates: { x: 60, y: 85 } },
      { id: 'LST', label: 'ST', coordinates: { x: 40, y: 85 } },
    ],
  },
];
