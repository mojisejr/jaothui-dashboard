import React, { useEffect, useState } from "react";
import { api } from "~/utils/api";
import { useRef } from "react";
import BaseLayout from "~/components/layout/BaseLayout";
import PreEditForm from "~/components/update-buffalo-info/PreEditForm";
import { IMetadata } from "~/interfaces/i-metadata";
import UpdateImageDialog from "~/components/update-buffalo-info/UpdateImage";
import UpdateMicrochipDialog from "~/components/update-buffalo-info/UpdateMicrochip";
import UpdateNameDialog from "~/components/update-buffalo-info/UpdateName";
import UpdateOriginDialog from "~/components/update-buffalo-info/UpdateOrigin";
import UpdateColorDialog from "~/components/update-buffalo-info/UpdateColor";
import UpdateDetailDialog from "~/components/update-buffalo-info/UpdateDetail";
import UpdateSexDialog from "~/components/update-buffalo-info/UpdateSex";
import UpdateHeightDialog from "~/components/update-buffalo-info/UpdateHeight";
import UpdateBirthdayDialog from "~/components/update-buffalo-info/UpdateBirthday";
import UpdateCertNoDialog from "~/components/update-buffalo-info/UpdateCertNo";
import UpdateDNADialog from "~/components/update-buffalo-info/UpdateDNA";
import UpdateRarityDialog from "~/components/update-buffalo-info/UpdateRarity";
import UpdateParentDialog from "~/components/update-buffalo-info/UpdateParent";

const UpdateBuffalo = () => {
  const [microchip, setMicrochip] = useState<string>();
  const searchRef = useRef<HTMLInputElement>(null);

  const {
    data: metadata,
    isLoading,
    isError,
    error,
    refetch: search,
  } = api.metadata.getMetadataByMicrochip.useQuery(microchip!, {
    enabled: false,
  });

  useEffect(() => {
    if (microchip) {
      void search();
    }
  }, [microchip]);

  useEffect(() => {
    if (isError && error != null) {
      alert(error.message);
      searchRef.current?.value == "";
    }
  }, [error, isError]);

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
  return (
    <BaseLayout title="ระบบค้นหา และ แก้ไข ข้อมูลควาย">
      <div className="mb-20 mt-2 flex w-full justify-center">
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
      {!metadata ? (
        <></>
      ) : (
        <div className="flex w-full justify-center">
          <PreEditForm metadata={metadata} />
        </div>
      )}
      <UpdateImageDialog metadata={metadata!} />
      <UpdateMicrochipDialog metadata={metadata!} />
      <UpdateNameDialog metadata={metadata!} />
      <UpdateOriginDialog metadata={metadata!} />
      <UpdateColorDialog metadata={metadata!} />
      <UpdateDetailDialog metadata={metadata!} />
      <UpdateSexDialog metadata={metadata!} />
      <UpdateBirthdayDialog metadata={metadata!} />
      <UpdateHeightDialog metadata={metadata!} />
      <UpdateCertNoDialog metadata={metadata!} />
      <UpdateDNADialog metadata={metadata!} />
      <UpdateRarityDialog metadata={metadata!} />
      <UpdateParentDialog metadata={metadata!} />
    </BaseLayout>
  );
};

export default UpdateBuffalo;
