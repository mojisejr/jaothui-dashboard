export interface IPedigree {
  tokenId: string;
  name: string;
  microchip: string;
  certNo?: string;
  origin: string;
  color: string;
  imageUrl: string;
  detail?: string;
  sex: string;
  rarity: string;
  birthday: Date;
  height: number;
  motherId?: string;
  fatherId?: string;
  isMinted: boolean;
}

export type ICreatePedigreeDTO = Omit<IPedigree, "isMinted">;
