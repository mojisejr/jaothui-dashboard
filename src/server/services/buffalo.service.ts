import { uploadImage } from "./supabase/upload-imagefile";
import { uploadJson } from "./supabase/upload-jsonfile";
import { getImageUrl, getJsonUrl } from "./supabase/supabase";
import { db } from "../db";
import { JsonMetadata } from "~/interfaces/i-metadata-json";

export const uploadBuffaloJson = async (
  tokenId: number,
  metadata: string,
  motherId?: string,
  fatherId?: string,
) => {
  const parsed = JSON.parse(metadata) as JsonMetadata;

  if (parsed == undefined) throw Error("parsed metadata error");

  const result = await db.pedigree.create({
    data: {
      tokenId: parsed.edition,
      microchip: parsed.attributes[1]?.value ?? "N/A",
      name: parsed.name.split(" #")[0] ?? "N/A",
      certNo: "N/A",
      birthday: new Date(parsed.attributes[2]?.value ?? 0),
      sex: parsed.attributes[0]?.value ?? "N/A",
      motherId: motherId ?? "N/A",
      fatherId: fatherId ?? "N/A",
      origin: parsed.attributes[4]?.value ?? "N/A",
      height: 0,
      color: parsed.attributes[3]?.value ?? "N/A",
      createdAt: new Date().getTime().toString(),
      updatedAt: new Date().getTime().toString(),
      detail: "N/A",
      dna: "N/A",
      image: parsed.image.split(".")[0],
      rarity: parsed.attributes[6]?.value ?? "Normal",
    },
  });

  if (!result) throw Error("create search data failed cannot update json");

  return await uploadJson(tokenId, metadata);
};

export const uploadBuffaloImage = async (
  tokenId: number,
  buffaloBuffer: Buffer,
) => {
  return await uploadImage(tokenId, buffaloBuffer);
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
