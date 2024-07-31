export interface IMetadata {
  tokenId?: number;
  name: string;
  origin: string;
  color: string;
  image?: string;
  detail: string;
  sex: string;
  birthdate: number;
  birthday: string;
  height: string;
  microchip: string;
  certNo: string;
  dna: string;
  rarity: string;
  fatherId: string;
  motherId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Attribute {
  trait_type: string;
  value: string | Date | number;
}
