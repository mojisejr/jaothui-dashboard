import React, { useEffect, useState } from "react";
import { useBuffaloInfo } from "~/context/buffalo-info.context";
import { api } from "~/utils/api";
import { useRouter } from "next/router";
import { useCountdownTimer } from "~/hooks/useCountdownTimer";

const Minting = () => {
  const { replace } = useRouter();

  const [minted, setMinted] = useState<boolean>(false);

  // Countdown timer for 30 seconds after minting
  const countdown = useCountdownTimer({
    initialSeconds: 30,
    onComplete: () => {
      console.log("Countdown completed - Add Metadata button is now enabled");
    },
  });

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
      alert("mint เรียบร้อยแล้ว รอ 30 วินาทีก่อนเพิ่ม metadata");
      setMinted(true);
      // Start countdown timer after successful mint
      countdown.start();
    }

    if (mintingError) {
      alert("mint nft ไม่สำเร็จ");
    }
  }, [mintingError, mintingSuccess, countdown]);

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

    if (countdown.isActive) {
      alert(`กรุณารอ ${countdown.timeLeft} วินาทีก่อนเพิ่ม metadata`);
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
        <div className="space-y-2">
          {countdown.isActive && (
            <div className="text-center">
              <div className="text-sm text-warning font-medium">
                รอ {countdown.timeLeft} วินาทีก่อนเพิ่ม metadata
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                <div
                  className="bg-warning h-2 rounded-full transition-all duration-1000"
                  style={{
                    width: `${((30 - countdown.timeLeft) / 30) * 100}%`,
                  }}
                ></div>
              </div>
            </div>
          )}
          <button
            disabled={addingMeta || countdown.isActive}
            onClick={() => handleAddMetadata()}
            className={`btn btn-primary w-full ${
              countdown.isActive ? "btn-disabled" : ""
            }`}
          >
            {addingMeta
              ? "Minting..."
              : countdown.isActive
              ? `รอ ${countdown.timeLeft} วินาที`
              : "Mint Metadata"}
          </button>
        </div>
      )}
    </div>
  );
};

export default Minting;
