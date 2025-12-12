import React from "react";
import { 
  RiUserAddFill, 
  RiUserSettingsFill, 
  RiWallet3Fill, 
  RiTrophyFill,
  RiTestTubeFill,
  RiFileExcel2Fill,
  RiAwardFill
} from "react-icons/ri";
import Header from "~/components/ui/Header";
import DashboardCard from "~/components/ui/DashboardCard";
import CardGrid from "~/components/ui/CardGrid";
import AmbientOrbs from "~/components/ui/AmbientOrbs";

const Dashboard = () => {
  return (
    <div className="relative min-h-screen bg-dark">
      <AmbientOrbs />
      <Header />
      
      <main className="relative z-10 px-6 py-12">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-8 text-center text-3xl font-bold text-white">
            Buffalo Management System
          </h2>
          
          <CardGrid>
            <DashboardCard
              title="เพิ่มข้อมูลควาย"
              icon={<RiUserAddFill />}
              href="/dashboard/new-buffalo-info"
              variant="orange"
            />
            <DashboardCard
              title="แก้ไขข้อมูลควาย"
              icon={<RiUserSettingsFill />}
              href="/dashboard/update-buffalo-info"
              variant="purple"
            />
            <DashboardCard
              title="อัพเดด Wallet"
              icon={<RiWallet3Fill />}
              href="/dashboard/update-wallet"
              variant="orange"
            />
            <DashboardCard
              title="เพิ่มข้อมูลรางวัล"
              icon={<RiTrophyFill />}
              href="/dashboard/new-reward"
              variant="purple"
            />
            <DashboardCard
              title="อัพเดดข้อมูล DNA"
              icon={<RiTestTubeFill />}
              href="/dashboard/update-buffalo-dna"
              variant="orange"
            />
            <DashboardCard
              title="ส่งออกข้อมูลอีเวนต์"
              icon={<RiFileExcel2Fill />}
              href="/dashboard/event-export"
              variant="purple"
            />
            <DashboardCard
              title="By Pass ใบเพ็ด"
              icon={<RiAwardFill />}
              href="/dashboard/certificate-approvment"
              variant="orange"
            />
          </CardGrid>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
