export type TransferDirection = "in" | "out";

export type TransferKind = "完全" | "レンタル" | "昇格" | "満了" | "解除";

export type TransferFeeCurrency = "JPY" | "GBP" | "EUR";

export interface TransferLog {
  id: string;
  season: string;
  direction: TransferDirection;
  kind?: TransferKind;
  playerId?: string;
  playerName: string;
  age?: number;
  position?: string;
  counterparty: string;
  fee?: number;
  feeCurrency?: TransferFeeCurrency;
  annualSalary?: number;
  annualSalaryCurrency?: TransferFeeCurrency;
  contractYears?: number;
  createdAt?: any;
  updatedAt?: any;
}
