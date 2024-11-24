import React from "react";
import Image from "next/image";
import { IMetadata } from "~/interfaces/i-metadata";
import Link from "next/link";

interface PreEditFormProps {
  metadata: IMetadata;
}

const PreEditForm = ({ metadata }: PreEditFormProps) => {
  return (
    <div className="p-4 md:p-0">
      <figure className="relative max-w-md">
        <Image src={metadata.image!} width={760} height={10000} alt="image" />
        <button
          onClick={() => {
            window.upload_image_dialog.showModal();
          }}
          className="btn btn-primary absolute right-0 top-0"
        >
          Edit Picture
        </button>
      </figure>
      <div className="form-control">
        <label className="label label-text">tokenId</label>
        <div className="flex gap-2">
          <input
            className="input-border input input-primary w-full"
            type="text"
            value={metadata.tokenId}
            readOnly
          ></input>
        </div>
      </div>
      <div className="form-control">
        <label className="label label-text">microchip</label>
        <div className="flex gap-2">
          <input
            className="input-border input input-primary w-full"
            type="text"
            value={metadata.microchip}
            readOnly
          ></input>

          <button
            onClick={() => {
              window.upload_microchip_dialog.showModal();
            }}
            className="btn btn-primary"
          >
            แก้ไข
          </button>
        </div>
      </div>
      <div className="form-control">
        <label className="label label-text">name</label>
        <div className="flex gap-2">
          <input
            className="input-border input input-primary w-full"
            type="text"
            value={metadata.name}
            readOnly
          ></input>

          <button
            onClick={() => {
              window.upload_name_dialog.showModal();
            }}
            className="btn btn-primary"
          >
            แก้ไข
          </button>
        </div>
      </div>
      <div className="form-control">
        <label className="label label-text">origin</label>
        <div className="flex gap-2">
          <input
            className="input-border input input-primary w-full"
            type="text"
            value={metadata.origin}
            readOnly
          ></input>

          <button
            onClick={() => {
              // window.upload_origin_dialog.showModal();
              window.origin_dialog.showModal();
            }}
            className="btn btn-primary"
          >
            แก้ไข
          </button>
        </div>
      </div>
      <div className="form-control">
        <label className="label label-text">color</label>
        <div className="flex gap-2">
          <input
            className="input-border input input-primary w-full"
            type="text"
            value={metadata.color}
            readOnly
          ></input>

          <button
            onClick={() => {
              // window.upload_color_dialog.showModal();
              window.color_dialog.showModal();
            }}
            className="btn btn-primary"
          >
            แก้ไข
          </button>
        </div>
      </div>
      <div className="form-control">
        <label className="label label-text">detail</label>
        <div className="flex gap-2">
          <input
            className="input-border input input-primary w-full"
            type="text"
            value={metadata.detail}
            readOnly
          ></input>

          <button
            onClick={() => {
              window.upload_detail_dialog.showModal();
            }}
            className="btn btn-primary"
          >
            แก้ไข
          </button>
        </div>
      </div>
      <div className="form-control">
        <label className="label label-text">sex</label>
        <div className="flex gap-2">
          <input
            className="input-border input input-primary w-full"
            type="text"
            value={metadata.sex}
            readOnly
          ></input>

          <button
            onClick={() => {
              window.upload_sex_dialog.showModal();
            }}
            className="btn btn-primary"
          >
            แก้ไข
          </button>
        </div>
      </div>
      <div className="form-control">
        <label className="label label-text">birthday</label>
        <div className="flex gap-2">
          <input
            className="input-border input input-primary w-full"
            type="text"
            value={metadata.birthday}
            readOnly
          ></input>

          <button
            onClick={() => {
              window.upload_birthday_dialog.showModal();
            }}
            className="btn btn-primary"
          >
            แก้ไข
          </button>
        </div>
      </div>
      <div className="form-control">
        <label className="label label-text">height</label>
        <div className="flex gap-2">
          <input
            className="input-border input input-primary w-full"
            type="text"
            value={metadata.height}
            readOnly
          ></input>

          <button
            onClick={() => {
              window.upload_height_dialog.showModal();
            }}
            className="btn btn-primary"
          >
            แก้ไข
          </button>
        </div>
      </div>
      <div className="form-control">
        <label className="label label-text">certNo</label>
        <div className="flex gap-2">
          <input
            className="input-border input input-primary w-full"
            type="text"
            value={metadata.certNo}
            readOnly
          ></input>

          <button
            onClick={() => {
              window.upload_certNo_dialog.showModal();
            }}
            className="btn btn-primary"
          >
            แก้ไข
          </button>
        </div>
      </div>
      <div className="form-control">
        <label className="label label-text">dna</label>
        <div className="flex gap-2">
          <input
            className="input-border input input-primary w-full"
            type="text"
            value={metadata.dna}
            readOnly
          ></input>

          <Link
            href="/dashboard/update-buffalo-dna"
            className="btn btn-primary"
          >
            แก้ไข
          </Link>
        </div>
      </div>
      <div className="form-control">
        <label className="label label-text">rarity</label>
        <div className="flex gap-2">
          <input
            className="input-border input input-primary w-full"
            type="text"
            value={metadata.rarity}
            readOnly
          ></input>

          <button
            onClick={() => {
              window.upload_rarity_dialog.showModal();
            }}
            className="btn btn-primary"
          >
            แก้ไข
          </button>
        </div>
      </div>
      <div className="form-control">
        <label className="label label-text">fatherId</label>
        <input
          className="input-border input input-primary"
          type="text"
          value={metadata.fatherId}
          readOnly
        ></input>
      </div>
      <div className="form-control">
        <label className="label label-text">motherId</label>
        <input
          className="input-border input input-primary"
          type="text"
          value={metadata.motherId}
          readOnly
        ></input>
      </div>
      <div className="my-2 flex w-full justify-end">
        <button
          onClick={() => {
            window.upload_parent_dialog.showModal();
          }}
          className="btn btn-primary"
        >
          แก้ไขข้อมูลพ่อแม่
        </button>
      </div>
    </div>
  );
};

export default PreEditForm;
