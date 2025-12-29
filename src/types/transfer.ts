export type TransferDirection = "in" | "out";

export type TransferFeeCurrency = "JPY" | "GBP" | "EUR";

export interface TransferLog {
  id: string;
  season: string;
  direction: TransferDirection;
  playerId?: string;
  playerName: string;
  age?: number;
  position?: string;
  counterparty: string;
  fee?: number;
  feeCurrency?: TransferFeeCurrency;
  createdAt?: any;
  updatedAt?: any;
}
