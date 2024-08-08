import React from "react";
import BaseLayout from "~/components/layout/BaseLayout";
import MenuButton from "~/components/menu/MenuButton";
import { api } from "~/utils/api";

const Dashboard = () => {
  const { data } = api.metadata.getMetaForManager.useQuery({ tokenId: 392 });

  console.log(data);
  return (
    <BaseLayout>
      <div className="flex justify-center">
        <div className="grid max-w-2xl grid-cols-2 gap-2 p-2 md:gap-4">
          <MenuButton
            title="เพิ่มข้อมูลควาย"
            path="/dashboard/new-buffalo-info"
          />
          <MenuButton className="bg-slate-300" title="??" path="#" />
          <MenuButton className="bg-slate-300" title="??" path="#" />
          <MenuButton className="bg-slate-300" title="??" path="#" />
          <MenuButton className="bg-slate-300" title="??" path="#" />
          <MenuButton className="bg-slate-300" title="??" path="#" />
        </div>
      </div>
    </BaseLayout>
  );
};

export default Dashboard;
