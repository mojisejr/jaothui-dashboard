import React, { useEffect, useRef, useState } from "react";
import BaseLayout from "~/components/layout/BaseLayout";
import { api } from "~/utils/api";

function CertificateApprovement() {
  const searchRef = useRef<HTMLInputElement>(null);
  const [microchip, setMicrochip] = useState<string>();

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
    }
  }, [isByPassSuccess]);

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
                <div>
                  {info?.approved ? (
                    <div>{info?.name} Approved เรียบร้อย</div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <div className="rounded-xl border border-primary p-4">
                        <ul className="space-y-1 text-xl">
                          <li>ชื่อควาย: {info?.name}</li>
                          <li>microchip: {info?.microchip}</li>
                          <li>
                            <div className="badge badge-error badge-lg text-white">
                              ยังไม่ approve
                            </div>
                          </li>
                        </ul>
                      </div>
                      <div className="flex flex-col gap-2 rounded-md bg-error p-1 text-xl text-white">
                        อย่าลืมกรอกข้อมูลที่หน้าลงทะเบียนก่อนกด approve
                        <button
                          disabled={isByPassingPending}
                          onClick={handleApprovment}
                          className="btn btn-primary"
                        >
                          {isByPassingPending ? "Approving" : "Approve"}
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
