import React from "react";
import { 
  Cow,
  PencilSimpleLine,
  Wallet,
  Trophy,
  Dna,
  Export,
  FileLock
} from "@phosphor-icons/react";
import Header from "~/components/ui/Header";
import DashboardCard from "~/components/ui/DashboardCard";
import CardGrid from "~/components/ui/CardGrid";
import AmbientOrbs from "~/components/ui/AmbientOrbs";

const Dashboard = () => {
  return (
    <div className="relative min-h-screen bg-dark">
      <AmbientOrbs />
      <Header />
      
      <main className="relative z-10 flex min-h-[calc(100vh-120px)] items-center justify-center px-5 py-10">
        <div className="mx-auto w-full max-w-4xl">
          <h2 className="mb-8 text-center text-3xl font-bold text-white">
            Buffalo Management System
          </h2>
          
          <CardGrid>
            <DashboardCard
              title="เพิ่มข้อมูลควาย"
              icon={<Cow weight="duotone" />}
              href="/dashboard/new-buffalo-info"
              variant="orange"
            />
            <DashboardCard
              title="แก้ไขข้อมูลควาย"
              icon={<PencilSimpleLine weight="duotone" />}
              href="/dashboard/update-buffalo-info"
              variant="purple"
            />
            <DashboardCard
              title="อัพเดด Wallet"
              icon={<Wallet weight="duotone" />}
              href="/dashboard/update-wallet"
              variant="orange"
            />
            <DashboardCard
              title="เพิ่มข้อมูลรางวัล"
              icon={<Trophy weight="duotone" />}
              href="/dashboard/new-reward"
              variant="purple"
            />
            <DashboardCard
              title="อัพเดดข้อมูล DNA"
              icon={<Dna weight="duotone" />}
              href="/dashboard/update-buffalo-dna"
              variant="orange"
            />
            <DashboardCard
              title="ส่งออกข้อมูลอีเวนต์"
              icon={<Export weight="duotone" />}
              href="/dashboard/event-export"
              variant="purple"
            />
            <DashboardCard
              title="By Pass ใบเพ็ด"
              icon={<FileLock weight="duotone" />}
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
