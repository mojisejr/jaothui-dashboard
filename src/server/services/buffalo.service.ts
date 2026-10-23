import { getImageUrl, getJsonUrl } from "./supabase/supabase";
import { db } from "../db";
import { type Reward } from "~/interfaces/i-reward";

export const uploadBuffaloJson = async (
  _tokenId: number,
  _metadata: string,
  _motherId?: string,
  _fatherId?: string,
) => {
  throw new Error("LEGACY_WRITE_REQUIRES_DURABLE_OPERATION");
};

export const uploadBuffaloImage = async (
  _tokenId: number,
  _buffaloBuffer: Buffer,
) => {
  throw new Error("LEGACY_WRITE_REQUIRES_DURABLE_OPERATION");
};

export const checkCanMint = async (tokenId: number) => {
  const image = getImageUrl(tokenId.toString(), false);
  const metadata = getJsonUrl(tokenId.toString(), false);

  if (!image || !metadata) {
    return false;
  } else {
    return true;
  }
};

export const getByMicrochip = async (microchip: string) => {
  try {
    const found = await db.pedigree.findFirst({
      where: { microchip },
      include: { Reward: true },
    });
    return found;
  } catch (error) {
    console.log(error);
    return null;
  }
};

export const addNewReward = async (reward: Reward) => {
  try {
    const created = await db.reward.create({ data: reward });
    return created;
  } catch (error) {
    console.log(error);
    return null;
  }
};

export const updateDNA = async (
  _tokenId: string,
  _microchip: string,
  _dnaURL: string,
) => {
  throw new Error("LEGACY_WRITE_REQUIRES_DURABLE_OPERATION");
};
