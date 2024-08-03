import { getImageUrl, supabase } from "./supabase";

export const uploadImage = async (tokenId: number, image: Buffer) => {
  // .from("slipstorage/buffalo")
  const uploadResult = await supabase.storage
    .from("slipstorage/buffalo")
    // .from("test/buffalo")
    .upload(`${tokenId}.jpg`, image, {
      upsert: true,
      contentType: "image/jpg",
      cacheControl: "0",
    });

  if (uploadResult.error == null) {
    const imageUrl = getImageUrl(uploadResult.data?.path, false);
    return imageUrl;
  }
};
