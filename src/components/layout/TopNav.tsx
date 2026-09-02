import Image from "next/image";
import logoExtended from "@/assets/logo/logo-extended.svg";
import LogoutButton from "./LogoutButton";
import NotificationDropdown from "./NotificationDropdown";
import SettingsDropdown from "./SettingsDropdown";
import UserProfileDropdown from "./UserProfileDropdown";

export interface TopNavProps {
  /** Single uppercase letter shown in the avatar circle */
  userInitial?: string;
}

export default function TopNav({ userInitial = "N" }: TopNavProps) {
  return (
    <header className="sticky top-0 z-50 h-[72px] border-b border-[#edf0f4] bg-white">
      <div className="mx-auto flex h-full w-full max-w-[1380px] items-center justify-between px-5 sm:px-6">
        <Image
          src={logoExtended}
          alt="ADAVIS"
          height={44}
          width={124}
          className="h-11 w-auto"
          priority
        />

        <div className="flex items-center gap-1.5 text-[#3f464f]">
          <NotificationDropdown />
          <SettingsDropdown />
          <LogoutButton />
          <div className="mx-1 h-7 w-px bg-[#cfd8e4]" />
          <UserProfileDropdown />
        </div>
      </div>
    </header>
  );
}

