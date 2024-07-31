import React, { ReactNode } from "react";
import { useAuth } from "~/context/auth.context";
import { IoArrowBack } from "react-icons/io5";
import { useRouter } from "next/router";

interface BaseLayoutProps {
  title?: string;
  children: ReactNode;
}

const BaseLayout = ({ children, title }: BaseLayoutProps) => {
  const { logout } = useAuth();
  const { back, pathname } = useRouter();
  return (
    <div className="min-h-screen">
      <div className="navbar rounded-bl-xl rounded-br-xl bg-primary shadow">
        <div className="navbar-start">
          {pathname === "/dashboard" ? null : (
            <button className="btn btn-ghost btn-sm" onClick={() => back()}>
              <IoArrowBack size={28} />
            </button>
          )}
        </div>
        <div className="navbar-center font-bold">
          {title ? title : "Dashboard"}
        </div>
        <div className="navbar-end">
          <button className="btn" onClick={() => logout()}>
            Logout
          </button>
        </div>
      </div>
      {children}
    </div>
  );
};

export default BaseLayout;
