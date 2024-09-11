import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { IMetadata } from "~/interfaces/i-metadata";
import { supabase } from "~/server/services/supabase/supabase";
import { jsonMetadataGenerate } from "~/server/utils/jsonGenerator";
import { api } from "~/utils/api";

interface UpdateImageDialogProps {
  metadata: IMetadata;
}

type inputType = {
  image: FileList;
};

const UpdateImageDialog = ({ metadata }: UpdateImageDialogProps) => {
  const [loading, setLoading] = useState<boolean>(false);
  const { register, handleSubmit, reset } = useForm<inputType>();
  const {
    mutate: update,
    isPending,
    isSuccess,
    isError,
    error,
  } = api.metadata.updateBuffaloImage.useMutation();

  const onSubmit = handleSubmit(async (data, event) => {
    setLoading(true);
    event?.preventDefault();

    if (metadata.tokenId == undefined || metadata.tokenId == null) {
      alert("ไม่พบข้อมูล tokenId");
      setLoading(false);
      return;
    }

    const buffer = await data.image[0]?.arrayBuffer();
    const byteArray = new Uint8Array(buffer!);

    //New Image Upsert
    const uploadResult = await supabase.storage
      .from("slipstorage/buffalo")
      .upload(`${metadata.tokenId}.jpg`, byteArray, {
        contentType: "image/jpg",
        upsert: true,
        cacheControl: "0",
      });

    if (uploadResult.error != null) {
      alert("ไม่สามารถ upload ภาพได้");
      setLoading(false);
      return;
    }

    //Json Metadata Generate
    const jsonMetadata = jsonMetadataGenerate(
      metadata,
      uploadResult.data.fullPath,
    );

    //Upload Json Metadata
    const jsonUploadResult = await supabase.storage
      .from("slipstorage/json")
      .upload(`${metadata.tokenId}.json`, JSON.stringify(jsonMetadata), {
        upsert: true,
      });

    if (jsonUploadResult.error != null) {
      alert("ไม่สามารถ upload ภาพได้");
      setLoading(false);
      return;
    }

    //Upload Json

    update(metadata.tokenId);
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
    <dialog id="upload_image_dialog" className="modal">
      <div className="modal-box">
        <h3 className="text-lg font-bold">แก้ไขข้อมูลภาพ</h3>
        <form onSubmit={onSubmit} className="grid grid-cols-1 gap-2">
          <input
            type="file"
            accept="image/jpg"
            className="file-input"
            {...register("image", { required: true })}
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

export default UpdateImageDialog;
