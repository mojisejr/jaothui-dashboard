import { getRewardUrl, supabase } from "./supabase";

export const uploadRewardImage = async (
  microchip: string,
  rewardId: string,
  image: Buffer,
) => {
  // .from("slipstorage/buffalo")
  const uploadResult = await supabase.storage
    .from("slipstorage/reward")
    // .from("test/buffalo")
    .upload(`${microchip}_${rewardId}.jpg`, image, {
      upsert: true,
      contentType: "image/jpg",
      cacheControl: "0",
    });

  if (uploadResult.error == null) {
    const imageUrl = getRewardUrl(uploadResult.data?.path);
    return imageUrl;
  }
};
