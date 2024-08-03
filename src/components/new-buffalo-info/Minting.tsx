import React, { useEffect, useState } from "react";
import { useBuffaloInfo } from "~/context/buffalo-info.context";
import { api } from "~/utils/api";
import { useRouter } from "next/router";

const Minting = () => {
  const { replace } = useRouter();

  const [minted, setMinted] = useState<boolean>(false);

  const { newBuffaloInfo, completeMinting } = useBuffaloInfo();
  const {
    mutateAsync: mint,
    isPending: minting,
    isError: mintingError,
    isSuccess: mintingSuccess,
  } = api.metadata.mint.useMutation();

  const {
    mutateAsync: addMeta,
    isPending: addingMeta,
    isError: addingMetaError,
    isSuccess: addingMetaSuccess,
  } = api.metadata.addMetadata.useMutation();

  useEffect(() => {
    if (mintingSuccess && !minted) {
      alert("mint เรียบร้อยแล้ว เพ่ิม metadata ได้เลย");
      setMinted(true);
    }

    if (mintingError) {
      alert("mint nft ไม่สำเร็จ");
    }
  }, [mintingError, mintingSuccess]);

  useEffect(() => {
    if (addingMetaSuccess && minted) {
      alert("เพิ่มข้อมูลสำเร็จ");
      completeMinting();
      void replace("/dashboard");
    }

    if (mintingError) {
      alert("mint แล้วแต่ add metadata ไม่สำเร็จ");
    }
  }, [addingMetaSuccess, addingMetaError, minted]);

  const handleMinting = async () => {
    await mint({
      tokenId: newBuffaloInfo?.tokenId ?? -1,
      newBuffalo: newBuffaloInfo!,
    });
  };

  const handleAddMetadata = async () => {
    if (!minted) {
      alert("ยังไม่มีการ mint");
      return;
    }

    await addMeta({
      tokenId: newBuffaloInfo?.tokenId ?? -1,
      newBuffalo: newBuffaloInfo!,
    });
  };

  return (
    <div className="my-10 grid grid-cols-1">
      <div className="py-2 font-bold text-accent">
        ข้อมูล NFT พร้อม Mint แล้วกดปุ่ม Mint เพื่อ Mint NFT
      </div>
      {!minted ? (
        <button
          disabled={minting}
          onClick={() => handleMinting()}
          className="btn btn-primary"
        >
          {minting ? "Minting..." : "Mint NFT"}
        </button>
      ) : (
        <button
          disabled={addingMeta}
          onClick={() => handleAddMetadata()}
          className="btn btn-primary"
        >
          {addingMeta ? "Minting..." : "Mint Metadata"}
        </button>
      )}
    </div>
  );
};

export default Minting;
