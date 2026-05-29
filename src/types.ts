export interface JastipFormData {
  nama: string;
  brand: string;
  item: string;
  qty: number;
  harga: number;
  feeJastip: number;
  total: number;
  payment: string;
}

export interface FormErrors {
  nama?: string;
  brand?: string;
  item?: string;
  qty?: string;
  harga?: string;
  feeJastip?: string;
  payment?: string;
}

export interface SpreadsheetInfo {
  title: string;
  sheets: {
    title: string;
    sheetId: number;
  }[];
}

export interface SpreadsheetRow {
  nama: string;
  brand: string;
  item: string;
  qty: string;
  harga: string;
  feeJastip: string;
  total: string;
  payment: string;
  timestamp?: string;
}
