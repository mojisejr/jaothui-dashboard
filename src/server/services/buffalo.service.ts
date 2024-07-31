import { uploadImage } from "./supabase/upload-imagefile";
import { uploadJson } from "./supabase/upload-jsonfile";
import { getImageUrl, getJsonUrl } from "./supabase/supabase";

export const uploadBuffaloJson = async (tokenId: number, metadata: string) => {
  return await uploadJson(tokenId, metadata);
};

export const uploadBuffaloImage = async (
  tokenId: number,
  buffaloBuffer: Buffer,
) => {
  return await uploadImage(tokenId, buffaloBuffer);
};

export const checkCanMint = async (tokenId: number) => {
  const image = getImageUrl(tokenId.toString(), true);
  const metadata = getJsonUrl(tokenId.toString(), true);

  if (!image || !metadata) {
    return false;
  } else {
    return true;
  }
};
