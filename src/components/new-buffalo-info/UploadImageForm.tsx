import React, { ChangeEvent, useState } from "react";
import Image from "next/image";
import { useBuffaloInfo } from "~/context/buffalo-info.context";
import { getImageUrl, supabase } from "~/server/services/supabase/supabase";

const UploadImageForm = () => {
  const [selectedImage, setSelectedImage] = useState<string>();
  const [file, setFile] = useState<File>();
  const { newBuffaloInfo, saveBuffaloImageUrl } = useBuffaloInfo();
  const [uploading, setUploading] = useState<boolean>(false);

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
    setUploading(true);
    if (!file) {
      setUploading(false);
      return;
    }
    const canUpload = file.size > 0 && file.size < 2000000;
    if (!canUpload) {
      alert("ขนาดไฟล์ต้องไม่เกิน 2mb");
      setUploading(false);
      return;
    }

    const buffer = await file?.arrayBuffer();
    const byteArray = new Uint8Array(buffer);

    const uploadResult = await supabase.storage
      .from("slipstorage/buffalo")
      // .from("test/buffalo")
      .upload(`${newBuffaloInfo?.tokenId}.jpg`, byteArray, {
        upsert: true,
        contentType: "image/jpg",
        cacheControl: "0",
      });
    if (uploadResult.error != null) {
      alert("ไม่สามารถ upload รูปได้");
      setUploading(false);
    }

    if (uploadResult.error == null) {
      const imageUrl = getImageUrl(uploadResult.data?.path, false);
      // return imageUrl;
      setUploading(false);
      saveBuffaloImageUrl(imageUrl);
    }
  };

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
