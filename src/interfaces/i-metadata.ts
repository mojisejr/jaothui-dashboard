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

export interface RawMetadata {
  name: string;
  origin: string;
  color: string;
  imageUri: string;
  detail: string;
  sex: string;
  birthdate: bigint;
  height: bigint;
  certify: {
    microchip: string;
    certNo: string;
    rarity: string;
    dna: string;
    issuedAt: bigint;
  };
  relation: { motherTokenId: string; fatherTokenId: string };
  createdAt: bigint;
  updatedAt: bigint;
}

export interface Attribute {
  trait_type: string;
  value: string | Date | number;
}
