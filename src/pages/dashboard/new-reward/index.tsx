import React, { useEffect, useRef, useState } from "react";
import BaseLayout from "~/components/layout/BaseLayout";
import { useForm } from "react-hook-form";
import { api } from "~/utils/api";
import { getRewardUrl, supabase } from "~/server/services/supabase/supabase";
import { Reward } from "~/interfaces/i-reward";

type InputType = {
  rewardImage: FileList;
  eventName: string;
  rewardName: string;
  eventDate: Date;
};

const NewRewardPage = () => {
  const [submitLoading, setSubmitLoading] = useState<boolean>(false);
  const [microchip, setMicrochip] = useState<string>();
  const searchRef = useRef<HTMLInputElement>(null);
  const { register, reset, handleSubmit } = useForm<InputType>();

  const {
    data: info,
    refetch: search,
    isSuccess,
    isLoading,
    isError,
    error,
  } = api.ped.searchByMicrochip.useQuery(microchip!, {
    enabled: false,
  });

  const {
    mutate: addReward,
    isSuccess: newRewardAdded,
    isError: newRewardAddingError,
  } = api.reward.addNewReward.useMutation();

  const onSubmit = handleSubmit(async (data, event) => {
    setSubmitLoading(true);
    event?.preventDefault();
    const microchip = info?.microchip;
    const index = info?.Reward.length ?? 0;
    if (!microchip) {
      alert("ไม่พบข้อมูลไม่โครชิพ");
      return;
    }

    const extension = data.rewardImage[0]?.name.split(".")[1];

    const uploadResult = await supabase.storage
      .from("slipstorage/reward")
      .upload(`${microchip}_${index + 1}.${extension}`, data.rewardImage[0]!, {
        cacheControl: "0",
      });

    if (uploadResult.error == null) {
      setSubmitLoading(false);
    }

    const imageUrl = getRewardUrl(uploadResult.data?.path ?? "");

    if (imageUrl == null) {
      setSubmitLoading(false);
      return;
    }

    const rewardToAdd: Reward = {
      microchip,
      eventName: data.eventName,
      eventDate: new Date(data.eventDate),
      rewardName: data.rewardName,
      rewardImage: imageUrl,
    };

    addReward(rewardToAdd);
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

  useEffect(() => {
    if (newRewardAdded) {
      alert("เพิ่มข้อมูลเรียบร้อยแล้ว");
      setSubmitLoading(false);
      return;
    }

    if (newRewardAddingError) {
      alert("ไม่สามารถเพิ่มข้อมูลได้");
      setSubmitLoading(false);
      return;
    }
  }, [newRewardAdded, newRewardAddingError]);

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
    <BaseLayout title="ระบบเพิ่มข้อมูลรางวัล">
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
      {!info ? null : (
        <div className="flex w-full justify-center">
          <div className="max-w-md p-2">
            <div className="p-2">
              <div className="text-xl font-bold">ข้อมูลควาย</div>
              <div>ชื่อ: {info.name}</div>
              <div>microchip: {info.microchip}</div>
            </div>
            <div className="p-2">
              <div className="text-xl font-bold">ข้อมูลรางวัล</div>
              <form onSubmit={onSubmit} className="grid grid-cols-1 gap-2">
                <div className="form-control">
                  <label className="label label-text">ภาพตอนรับรางวัล</label>
                  <input
                    type="file"
                    accept="image/png image/jpg image/jpeg"
                    className="file-input file-input-bordered file-input-primary"
                    {...register("rewardImage", { required: true })}
                  ></input>
                </div>
                <div className="form-control">
                  <input
                    type="text"
                    className="input input-bordered input-primary"
                    placeholder="ชื่องาน"
                    {...register("eventName", { required: true })}
                  ></input>
                </div>
                <div className="form-control">
                  <input
                    placeholder="รางวัล"
                    className="input input-bordered input-primary"
                    {...register("rewardName", { required: true })}
                  ></input>
                </div>
                <div className="form-control">
                  <input
                    className="input input-bordered input-primary"
                    type="date"
                    {...register("eventDate")}
                  ></input>
                </div>
                <button disabled={submitLoading} className="btn btn-primary">
                  {submitLoading ? "กำลังบันทึกข้อมูล..." : "บันทึกข้อมูล"}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </BaseLayout>
  );
};

export default NewRewardPage;
