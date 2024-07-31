import React, { ChangeEvent, useEffect, useState } from "react";
import Image from "next/image";
import { useBuffaloInfo } from "~/context/buffalo-info.context";
import { api } from "~/utils/api";

const UploadImageForm = () => {
  const [selectedImage, setSelectedImage] = useState<string>();
  const [file, setFile] = useState<File>();
  const { newBuffaloInfo, saveBuffaloImageUrl } = useBuffaloInfo();

  const {
    data: uploadedImageUrl,
    mutateAsync: upload,
    isPending: uploading,
    isError: uploadingError,
  } = api.image.upload.useMutation();

  const handleSelectImage = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setSelectedImage(undefined);
      return;
    }

    const url = URL.createObjectURL(file);
    setFile(file);
    setSelectedImage(url);
  };

  const handleUpload = async () => {
    if (!file) return;
    const canUpload = file.size > 0 && file.size < 2000000;
    if (!canUpload) {
      alert("ขนาดไฟล์ต้องไม่เกิน 2mb");
      return;
    }

    const buffer = await file?.arrayBuffer();
    const byteArray = new Uint8Array(buffer);

    await upload({
      tokenId: newBuffaloInfo?.tokenId ?? -1,
      image: Array.from(byteArray),
    });
  };

  useEffect(() => {
    if (uploadedImageUrl != undefined) {
      saveBuffaloImageUrl(uploadedImageUrl);
    }

    if (uploadingError) {
      setSelectedImage(undefined);
      setFile(undefined);
      alert("อัพโหลดไฟล์ไม่สำเร็จ!");
    }
  }, [uploadedImageUrl, uploadingError]);

  return (
    <form className="grid grid-cols-1 gap-2 p-2">
      <div className="form-control">
        <input
          onChange={(e) => handleSelectImage(e)}
          type="file"
          accept="image/png, image/jpeg, image/jpg"
          className="file-input"
        />
      </div>
      {selectedImage ? (
        <div className="flex flex-col gap-4">
          <figure className="max-w-[500px]">
            <Image src={selectedImage} width={1000} height={700} alt="image" />
          </figure>
          <button
            type="button"
            disabled={uploading}
            onClick={() => handleUpload()}
            className="btn btn-primary"
          >
            {uploading ? "Uploading.." : "Upload"}
          </button>
        </div>
      ) : null}
    </form>
  );
};

export default UploadImageForm;
