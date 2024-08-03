import { getJsonUrl, supabase } from "./supabase";

export const uploadJson = async (tokenId: number, metadata: string) => {
  const uploadResult = await supabase.storage

    // .from("test/json")
    .from("slipstorage/json")
    .upload(`${tokenId}.json`, metadata, {
      upsert: true,
      cacheControl: "0",
    });

  if (uploadResult.error == null) {
    const imageUrl = getJsonUrl(uploadResult.data?.path, false);
    return imageUrl;
  }
};
