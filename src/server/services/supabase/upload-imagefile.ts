import { getImageUrl, supabase } from "./supabase";

export const uploadImage = async (tokenId: number, image: Buffer) => {
  // .from("slipstorage/buffalo")
  const uploadResult = await supabase.storage
    .from("test/buffalo")
    .upload(`${tokenId}.jpeg`, image, {
      upsert: true,
      contentType: "image/jpeg",
      cacheControl: "0",
    });

  if (uploadResult.error == null) {
    const imageUrl = getImageUrl(uploadResult.data?.path, true);
    return imageUrl;
  }
};
