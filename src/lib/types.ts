export type ScanFormat =
  | 'QRCode'
  | 'DataMatrix'
  | 'PDF417'
  | 'Aztec'
  | 'EAN13'
  | 'EAN8'
  | 'UPCA'
  | 'UPCE'
  | 'Code128'
  | 'Code39'
  | 'Code93'
  | 'Codabar'
  | 'ITF'
  | 'Unknown';

export interface ScanResult {
  text: string;
  format: ScanFormat;
}

export type HistorySource = 'scan' | 'generate';

export interface HistoryItem {
  id: string;
  ts: number;
  format: ScanFormat;
  text: string;
  source: HistorySource;
}

export type PayloadType =
  | 'text'
  | 'url'
  | 'wifi'
  | 'vcard'
  | 'event'
  | 'tel'
  | 'email'
  | 'sms';

export type Symbology =
  | 'qrcode'
  | 'datamatrix'
  | 'pdf417'
  | 'azteccode'
  | 'ean13'
  | 'ean8'
  | 'upca'
  | 'upce'
  | 'code128'
  | 'code39'
  | 'code93'
  | 'rationalizedCodabar'
  | 'interleaved2of5';
