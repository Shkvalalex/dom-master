
export type Source =
  | 'ITP_CW'
  | 'ODPU_SUPPLY'
  | 'ODPU_RETURN'
  | 'ODPU_CONSUMPTION';

export interface House {
  id: string;
  address: string;
}

export interface Reading {
  ts: string;           
  house_id: string;     
  src: Source;          
  volume_m3: number;    
  t_celsius?: number | null;
}
