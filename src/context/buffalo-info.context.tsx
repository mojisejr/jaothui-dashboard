import { type ReactNode, createContext, useContext, useState } from "react";
import { type NewBuffaloInput } from "~/components/new-buffalo-info/NewBuffaloForm";

type buffaloContextType = {
  step: number;
  buffaloImageUrl?: string | null;
  newBuffaloInfo?: NewBuffaloInput | null;
  metadataUrl?: string | null;
  saveBuffaloInput: (info: NewBuffaloInput) => void;
  saveBuffaloImageUrl: (imageUrl: string) => void;
  saveBuffaloJsonUrl: (metadataUrl: string) => void;
  completeMinting: () => void;
};

const buffaloInfoContextDefault: buffaloContextType = {
  step: 0,
  newBuffaloInfo: null,
  buffaloImageUrl: null,
  metadataUrl: null,
  saveBuffaloInput: () => ({}),
  saveBuffaloImageUrl: () => ({}),
  saveBuffaloJsonUrl: () => ({}),
  completeMinting: () => ({}),
};

const BuffaloContext = createContext<buffaloContextType>(
  buffaloInfoContextDefault,
);

type Props = {
  children: ReactNode;
};

export function BuffaloInfoProvider({ children }: Props) {
  const [step, setStep] = useState<number>(0);
  const [newBuffaloInfo, setNewBuffaloInfo] = useState<NewBuffaloInput>();
  const [buffaloImageUrl, setImageUrl] = useState<string>();
  const [metadataUrl, setMetadataUrl] = useState<string>();

  const saveBuffaloInput = (buffaloInfo: NewBuffaloInput) => {
    if (buffaloInfo == null || buffaloInfo == undefined) {
      setStep(0);
      return;
    }
    setNewBuffaloInfo(buffaloInfo);
    setStep(1);
  };

  const saveBuffaloImageUrl = (imageUrl: string) => {
    setImageUrl(imageUrl);
    setStep(2);
  };

  const saveBuffaloJsonUrl = (metadataUrl: string) => {
    setMetadataUrl(metadataUrl);
    setStep(3);
  };

  const completeMinting = () => {
    setImageUrl(undefined);
    setMetadataUrl(undefined);
    setNewBuffaloInfo(undefined);
    setStep(0);
  };

  const value = {
    step,
    buffaloImageUrl,
    newBuffaloInfo,
    metadataUrl,
    saveBuffaloInput,
    saveBuffaloImageUrl,
    saveBuffaloJsonUrl,
    completeMinting,
  };

  return (
    <BuffaloContext.Provider value={value}>{children}</BuffaloContext.Provider>
  );
}

export function useBuffaloInfo() {
  return useContext(BuffaloContext);
}
