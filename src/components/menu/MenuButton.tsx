import React from "react";
import Link from "next/link";

interface MenuButtonProps {
  title: string;
  path: string;
  className?: string;
}

const MenuButton = ({ title, path, className }: MenuButtonProps) => {
  return (
    <Link
      href={path}
      className={`${className} h-[100px] rounded-xl bg-primary p-4 shadow hover:cursor-pointer hover:bg-secondary`}
    >
      <div className="text-xl font-bold text-base-100">{title}</div>
    </Link>
  );
};

export default MenuButton;
