import dayjs from "dayjs";
import { IMetadata } from "~/interfaces/i-metadata";
import { JsonMetadata } from "~/interfaces/i-metadata-json";

export const jsonMetadataGenerate = (
  newBuffaloInfo: IMetadata,
  buffaloImageUrl: string,
) => {
  const formatMetadata: JsonMetadata = {
    name: `${newBuffaloInfo.name} #${newBuffaloInfo.microchip}`,
    edition: newBuffaloInfo.tokenId!,
    image: `https://wtnqjxerhmdnqszkhbvs.supabase.co/storage/v1/object/public/${buffaloImageUrl}`,
    description:
      "ยกระดับควายไทย ยกระดับการอนุรักษ์ ส่งควายไทย ให้โด่งดังไปสู่ Global กับโปรเจกต์ ‘JAOTHUI NFT’",
    attributes: [
      {
        trait_type: "Sex",
        value: newBuffaloInfo.sex,
      },
      {
        trait_type: "Microchip",
        value: newBuffaloInfo.microchip,
      },
      {
        trait_type: "Birthday",
        value: dayjs(newBuffaloInfo.birthday).format("MM/DD/YYYY"),
      },
      {
        trait_type: "Color",
        value: newBuffaloInfo.color,
      },
      {
        trait_type: "Origin",
        value: newBuffaloInfo.origin,
      },
      {
        trait_type: "Height",
        value: newBuffaloInfo.height.toString(),
      },
      {
        trait_type: "Rarity",
        value: newBuffaloInfo.rarity,
      },
      {
        trait_type: "IssuedAt",
        value: dayjs().format("DD/MM/YYYY"),
      },
    ],
    hashtag: ["buffalo", "nft", "jaothui", "pedigree"],
  };
  return formatMetadata;
};
