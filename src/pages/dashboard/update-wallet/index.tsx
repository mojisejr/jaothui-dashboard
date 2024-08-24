import React, { useEffect, useState } from "react";
import { api } from "~/utils/api";
import { useRef } from "react";

const UpdateWallet = () => {
  const searchRef = useRef<HTMLInputElement>(null);
  const updateRef = useRef<HTMLInputElement>(null);
  const [wallet, setWallet] = useState<string>();

  const {
    data: member,
    isLoading: memberLoading,
    refetch: search,
  } = api.kwaithai.getMemberId.useQuery(wallet!, { enabled: false });

  const {
    data: updateResult,
    isPending: walletUpdating,
    mutate: updateWallet,
    isSuccess: updateWalletSuccess,
    isError: updateWalletError,
  } = api.kwaithai.updateWallet.useMutation();

  useEffect(() => {
    if (wallet) {
      void search();
    }
  }, [wallet]);

  useEffect(() => {
    if (updateWalletSuccess) {
      if (updateResult) {
        alert("แก้ไขข้อมูลสำเร็จ");
        return;
      }

      if (!updateResult) {
        alert("แก้ไขข้อมูลผิดพลาด");
        return;
      }
    }

    if (updateWalletError) {
      if (!updateResult) {
        alert("แก้ไขข้อมูลผิดพลาด");
        return;
      }
    }
  }, [updateResult, updateWalletSuccess, updateWalletError]);

  const handleSearch = () => {
    if (!searchRef.current?.value) {
      alert("กรุณากรอกข้อมูล");
      return;
    }
    setWallet(searchRef.current?.value);
  };

  const handleUpdate = () => {
    if (!updateRef.current?.value || member == null) {
      alert("กรุณาใส่ข้อมูล wallet ที่จะแก้ไข");
      return;
    }
    const walletToUpdate = updateRef.current?.value;
    updateWallet({ memberId: member.id, walletToUpdate });
  };

  return (
    <div className="grid w-full grid-cols-1 px-6">
      <div className="py-4">
        <h1 className="text-xl font-bold">ระบบค้นหา และ แก้ไข wallet</h1>
        <h3>สำหรับ e-member kwaithai</h3>
      </div>

      <div className="flex flex-col gap-2">
        <input
          ref={searchRef}
          className="input input-bordered"
          placeholder="หมายเลข member เดิม"
          type="text"
        ></input>
        <button
          disabled={memberLoading}
          onClick={() => handleSearch()}
          className="btn btn-primary"
        >
          {memberLoading ? "กำลังค้นหา..." : "ค้นหา"}
        </button>
      </div>

      {memberLoading ? (
        <div>กำลังค้นหา..</div>
      ) : (
        <div className="py-6">
          {member == null ? (
            <div className="font-bold">ไม่พบข้อมูล</div>
          ) : (
            <div className="flex flex-col gap-2 border-2 p-4">
              <h1 className="text-xl">พบข้อมูล</h1>
              <h2>ชื่อ: {member.name}</h2>
              <input
                ref={updateRef}
                className="input-borderd input input-primary"
                placeholder="wallet ที่ต้องการแก้"
              ></input>
              <button
                onClick={() => handleUpdate()}
                disabled={walletUpdating}
                className="btn btn-primary"
              >
                {walletUpdating ? "กำลังบันทึก..." : "ยืนยินการแก้ไข"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default UpdateWallet;
