import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { type IMetadata } from "~/interfaces/i-metadata";
import { supabase } from "~/server/services/supabase/supabase";
import { jsonMetadataGenerate } from "~/server/utils/jsonGenerator";
import { api } from "~/utils/api";

interface UpdateDNADialogProps {
  metadata: IMetadata;
}

type inputType = {
  dna: string;
};

const UpdateDNADialog = ({ metadata }: UpdateDNADialogProps) => {
  const [loading, setLoading] = useState<boolean>(false);
  const { register, handleSubmit, reset } = useForm<inputType>();
  const {
    mutate: update,
    isPending,
    isSuccess,
    isError,
    error,
  } = api.metadata.updateBuffaloDna.useMutation();

  const onSubmit = handleSubmit(async (data, event) => {
    setLoading(true);
    event?.preventDefault();

    if (metadata.tokenId == undefined || metadata.tokenId == null) {
      alert("ไม่พบข้อมูล tokenId");
      setLoading(false);
      return;
    }

    //Json Metadata Generate
    const jsonMetadata = jsonMetadataGenerate(
      { ...metadata, dna: data.dna },
      `slipstorage/buffalo/${metadata.tokenId}.jpg`,
    );

    //Upload Json Metadata
    const jsonUploadResult = await supabase.storage
      .from("slipstorage/json")
      .upload(`${metadata.tokenId}.json`, JSON.stringify(jsonMetadata), {
        upsert: true,
      });

    if (jsonUploadResult.error != null) {
      alert("ไม่สามารถ upload ข้อมูลได้");
      setLoading(false);
      return;
    }

    console.log(jsonUploadResult);

    //Upload Json

    update({
      tokenId: metadata.tokenId,
      microchip: metadata.microchip,
      dna: data.dna,
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
    <dialog id="upload_dna_dialog" className="modal">
      <div className="modal-box">
        <h3 className="text-lg font-bold">แก้ไข dna</h3>
        <form onSubmit={onSubmit} className="grid grid-cols-1 gap-2">
          <input
            type="text"
            className="input input-bordered input-primary"
            {...register("dna", { required: true })}
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

export default UpdateDNADialog;
