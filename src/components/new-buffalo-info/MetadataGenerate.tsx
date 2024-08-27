import React, { useEffect } from "react";
import Image from "next/image";
import { useBuffaloInfo } from "~/context/buffalo-info.context";
import Link from "next/link";
import { JsonMetadata } from "~/interfaces/i-metadata-json";
import dayjs from "dayjs";
import { api } from "~/utils/api";

const MetadataGenerate = () => {
  const { buffaloImageUrl, newBuffaloInfo, saveBuffaloJsonUrl } =
    useBuffaloInfo();

  const {
    data: jsonUrl,
    isPending,
    isError,
    mutate: upload,
  } = api.metadata.upload.useMutation();

  const handleGenerateJsonMetadata = () => {
    if (!newBuffaloInfo || !buffaloImageUrl) return;
    const formatMetadata: JsonMetadata = {
      name: `${newBuffaloInfo.name} #${newBuffaloInfo.microchip}`,
      edition: newBuffaloInfo.tokenId!,
      image: buffaloImageUrl,
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

    upload({
      tokenId: newBuffaloInfo.tokenId!,
      metadata: JSON.stringify(formatMetadata),
      fatherId: newBuffaloInfo.fatherId!,
      motherId: newBuffaloInfo.motherId!,
    });
  };

  useEffect(() => {
    if (jsonUrl) {
      saveBuffaloJsonUrl(jsonUrl);
    }

    if (isError) {
      alert("upload metadata json ไม่สำเร็จ!");
    }
  }, [jsonUrl, isError]);

  return (
    <div className="my-5 grid grid-cols-1 place-items-center">
      <div className="py-2 text-xl font-bold text-accent">
        ตรวจสอบข้อมูลก่อนทำการ MINT
      </div>
      <figure className="w-48">
        <Image
          src={buffaloImageUrl!}
          width={1000}
          height={700}
          alt="buffalo-image"
        />
      </figure>
      <table className="table">
        <tbody>
          {newBuffaloInfo == undefined ? (
            <tr>
              <td>ไม่พบข้อมูล</td>
            </tr>
          ) : (
            Object.entries(newBuffaloInfo).map((data) => (
              <tr key={data[0]}>
                <td className="font-bold">{data[0]}</td>
                <td>
                  {data[0] == "birthday"
                    ? dayjs(data[1]).format("DD/MM/YYYY")
                    : data[1]?.toString()}
                </td>
              </tr>
            ))
          )}
          <tr>
            <td className="font-bold">ImageUrl</td>
            <td>
              <Link href={buffaloImageUrl!} target="_blank" className="link">
                link
              </Link>
            </td>
          </tr>
        </tbody>
      </table>
      <div>
        <button
          disabled={isPending}
          onClick={() => handleGenerateJsonMetadata()}
          className="btn btn-primary"
        >
          {isPending ? "Uploading..." : "Upload JSON Metadata"}
        </button>
      </div>
    </div>
  );
};

export default MetadataGenerate;
