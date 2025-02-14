import React from "react";
import BaseLayout from "~/components/layout/BaseLayout";
import MenuButton from "~/components/menu/MenuButton";

const Dashboard = () => {
  return (
    <BaseLayout>
      <div className="flex justify-center">
        <div className="grid max-w-2xl grid-cols-2 gap-2 p-2 md:gap-4">
          <MenuButton
            title="เพิ่มข้อมูลควาย"
            path="/dashboard/new-buffalo-info"
          />
          <MenuButton
            title="แก้ไขข้อมูลควาย"
            path="/dashboard/update-buffalo-info"
          />
          <MenuButton title="อัพเดด wallet" path="/dashboard/update-wallet" />
          <MenuButton
            className=""
            title="เพิ่มข้อมูลรางวัล"
            path="/dashboard/new-reward"
          />
          <MenuButton
            title="อัพเดดข้อมูล DNA"
            path="/dashboard/update-buffalo-dna"
          />
          <MenuButton
            title="By Pass ใบเพ็ด"
            path="/dashboard/certificate-approvment"
          />
        </div>
      </div>
    </BaseLayout>
  );
};

export default Dashboard;
