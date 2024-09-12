import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { IMetadata } from "~/interfaces/i-metadata";
import { api } from "~/utils/api";

interface UpdateParentDialogProps {
  metadata: IMetadata;
}

type inputType = {
  father: string;
  mother: string;
};

const UpdateParentDialog = ({ metadata }: UpdateParentDialogProps) => {
  const [loading, setLoading] = useState<boolean>(false);
  const { register, handleSubmit, reset } = useForm<inputType>();
  const {
    mutate: update,
    isPending,
    isSuccess,
    isError,
    error,
  } = api.metadata.updateParentId.useMutation();

  const onSubmit = handleSubmit(async (data, event) => {
    setLoading(true);
    event?.preventDefault();

    if (metadata.tokenId == undefined || metadata.tokenId == null) {
      alert("ไม่พบข้อมูล tokenId");
      setLoading(false);
      return;
    }

    update({
      microchip: metadata.microchip,
      fatherMicrochip: data.father,
      motherMicrochip: data.mother,
    });
  });

  useEffect(() => {
    if (isError) {
      alert(error.message);
      setLoading(false);
    }
  }, [isError, error]);

  useEffect(() => {
    if (isSuccess) {
      alert("แก้ไขข้อมูลสำเร็จ");
      setLoading(false);
    }
  }, [isSuccess]);

  return (
    <dialog id="upload_parent_dialog" className="modal">
      <div className="modal-box">
        <h3 className="text-lg font-bold">แก้ไข parent</h3>
        <div className="p-2 text-error">
          ใส่แค่พ่อหรือแม่ อย่างเดียวได้ แต่ถ้าข้อมูลเก่ามีอยู่แล้ว
          ต้องเอาข้อมูลเก่ามาใส่ด้วย เช่น เดิมมีแต่แม่ ไม่มีพ่อ ตอนจะ update
          ต้องเอาข้อมูลแม่ มาใส่ด้วย ไม่งั้นจะหายเพราะเป็นการ update
          พร้อมกันท้องสองช่อง
        </div>
        <form onSubmit={onSubmit} className="grid grid-cols-1 gap-2">
          <input
            type="text"
            className="input input-bordered input-primary"
            placeholder="microchip พ่อ"
            {...register("father")}
          ></input>
          <input
            type="text"
            className="input input-bordered input-primary"
            placeholder="microchip แม่"
            {...register("mother")}
          ></input>
          <button disabled={loading} className="btn btn-primary" type="submit">
            {loading ? (
              <div className="flex items-center gap-2">
                <div className="loading loading-spinner"></div>
                <span>กำลังแก้ไข...</span>
              </div>
            ) : (
              "ยืนยันการแก้ไข"
            )}
          </button>
        </form>
        <div className="modal-action">
          <form method="dialog">
            {/* if there is a button in form, it will close the modal */}
            <button disabled={loading} className="btn">
              ปิด
            </button>
          </form>
        </div>
      </div>
    </dialog>
  );
};

export default UpdateParentDialog;
