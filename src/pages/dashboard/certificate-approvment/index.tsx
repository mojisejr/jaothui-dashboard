import React, { useEffect, useRef, useState } from "react";
import BaseLayout from "~/components/layout/BaseLayout";
import { api } from "~/utils/api";

function CertificateApprovement() {
  const searchRef = useRef<HTMLInputElement>(null);
  const [microchip, setMicrochip] = useState<string>();

  // Form states for create certificate
  const [bornAt, setBornAt] = useState<string>("N/A");
  const [slipUrl, setSlipUrl] = useState<string>("N/A");
  const [ownerName, setOwnerName] = useState<string>("-");
  const ownerWallet = "0x0D97d89d690B8b692704CaC80bEBA49D9497d582"; // Readonly default

  const {
    data: info,
    refetch: search,
    isSuccess,
    isLoading,
    isError,
    error,
  } = api.cert.searchCert.useQuery(microchip!, {
    enabled: false,
  });

  const {
    data: byPassResult,
    mutate: byPass,
    isSuccess: isByPassSuccess,
    isPending: isByPassingPending,
    isError: isByPassError,
    error: byPassError,
  } = api.cert.byPassApprove.useMutation();

  const {
    mutate: createCert,
    isPending: isCreating,
    isSuccess: isCreateSuccess,
    isError: isCreateError,
    error: createError,
  } = api.cert.createCertBypass.useMutation();

  useEffect(() => {
    if (microchip) {
      void search();
    }
  }, [microchip]);

  useEffect(() => {
    if (byPassError) {
      alert("ไม่สามารถ approve ได้");
      return;
    }
  }, [isByPassError, byPassError]);

  useEffect(() => {
    if (isByPassSuccess && byPassResult) {
      alert(`approve สำเร็จแล้ว`);
      void search(); // Refresh info
    }
  }, [isByPassSuccess]);

  useEffect(() => {
    if (isCreateSuccess) {
      alert("สร้าง Certificate และ Approve สำเร็จแล้ว");
      void search(); // Refresh info
    }
  }, [isCreateSuccess]);

  useEffect(() => {
    if (isCreateError) {
      alert(`เกิดข้อผิดพลาด: ${createError?.message}`);
    }
  }, [isCreateError, createError]);

  const handleMicrochipSearch = () => {
    if (
      searchRef.current?.value == null ||
      searchRef.current?.value == undefined ||
      searchRef.current?.value == ""
    ) {
      alert("กรุณากรอก microchip");
      return;
    }
    setMicrochip(searchRef.current?.value);
  };

  const handleApprovment = () => {
    if (!microchip) {
      alert("ไม่พบข้อมูล microchip");
      return;
    }

    byPass(microchip);
  };

  const handleCreateAndApprove = () => {
    if (!microchip) {
      alert("ไม่พบข้อมูล microchip");
      return;
    }

    createCert({
      microchip,
      bornAt,
      slipUrl,
      ownerName,
      wallet: ownerWallet,
    });
  };

  return (
    <BaseLayout title="ByPass Approvement">
      <div className="mb-10 mt-2 flex w-full justify-center">
        <div className="grid grid-cols-1 gap-2 rounded-xl border-[1px] border-primary p-10">
          <div>ค้นหาควายด้วย microchip</div>
          <input
            ref={searchRef}
            className="intpu-bordered input input-primary"
            placeholder="microchip"
          ></input>
          <button
            disabled={isLoading}
            onClick={handleMicrochipSearch}
            className="btn btn-primary"
          >
            {isLoading ? "กำลังค้นหา.." : "ค้นหา"}
          </button>
        </div>
      </div>
      <div className="flex justify-center">
        <>
          {isLoading ? null : (
            <>
              {info != null ? (
                <div className="w-full max-w-md">
                  {info?.approved ? (
                    <div className="alert alert-success">
                      {info?.name} Approved เรียบร้อย
                    </div>
                  ) : (
                    <div className="flex flex-col gap-4">
                      <div className="rounded-xl border border-primary p-4">
                        <ul className="space-y-1 text-xl">
                          <li>ชื่อควาย: {info?.name ?? "ไม่พบข้อมูล"}</li>
                          <li>microchip: {info?.microchip ?? microchip}</li>
                          <li>
                            <div className="badge badge-error badge-lg text-white">
                              ยังไม่ approve / ไม่มี Certificate
                            </div>
                          </li>
                        </ul>
                      </div>

                      {/* Create Certificate Form */}
                      <div className="rounded-xl border border-secondary p-4 bg-base-200">
                        <h3 className="text-lg font-bold mb-2">
                          สร้าง Certificate ใหม่ (Bypass)
                        </h3>
                        <div className="form-control w-full">
                          <label className="label">
                            <span className="label-text">Born At (Optional)</span>
                          </label>
                          <input
                            type="text"
                            placeholder="N/A"
                            className="input input-bordered w-full"
                            value={bornAt}
                            onChange={(e) => setBornAt(e.target.value)}
                          />
                        </div>
                        <div className="form-control w-full">
                          <label className="label">
                            <span className="label-text">Slip URL (Optional)</span>
                          </label>
                          <input
                            type="text"
                            placeholder="N/A"
                            className="input input-bordered w-full"
                            value={slipUrl}
                            onChange={(e) => setSlipUrl(e.target.value)}
                          />
                        </div>
                        <div className="form-control w-full">
                          <label className="label">
                            <span className="label-text">Owner Name (Optional)</span>
                          </label>
                          <input
                            type="text"
                            placeholder="-"
                            className="input input-bordered w-full"
                            value={ownerName}
                            onChange={(e) => setOwnerName(e.target.value)}
                          />
                        </div>
                        <div className="form-control w-full">
                          <label className="label">
                            <span className="label-text">Owner Wallet (Readonly)</span>
                          </label>
                          <input
                            type="text"
                            className="input input-bordered w-full bg-gray-200"
                            value={ownerWallet}
                            readOnly
                          />
                        </div>
                        <div className="mt-4">
                          <button
                            disabled={isCreating}
                            onClick={handleCreateAndApprove}
                            className="btn btn-secondary w-full"
                          >
                            {isCreating
                              ? "Creating..."
                              : "Create & Bypass Approve"}
                          </button>
                        </div>
                      </div>

                      <div className="divider">OR</div>

                      <div className="flex flex-col gap-2 rounded-md bg-error p-1 text-xl text-white">
                        กรณีมี Certificate อยู่แล้วแต่ยังไม่ Approve
                        <button
                          disabled={isByPassingPending}
                          onClick={handleApprovment}
                          className="btn btn-primary"
                        >
                          {isByPassingPending ? "Approving" : "Approve Only"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </>
          )}
        </>
      </div>
    </BaseLayout>
  );
}

export default CertificateApprovement;
