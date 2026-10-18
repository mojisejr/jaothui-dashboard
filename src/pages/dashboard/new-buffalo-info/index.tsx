import React from "react";
import DurableCreate from "~/components/new-buffalo-info/DurableCreate";
import { type GetServerSideProps } from "next";
import BaseLayout from "~/components/layout/BaseLayout";
import MetadataGenerate from "~/components/new-buffalo-info/MetadataGenerate";
import Minting from "~/components/new-buffalo-info/Minting";
import NewBuffaloForm from "~/components/new-buffalo-info/NewBuffaloForm";
import UploadImageForm from "~/components/new-buffalo-info/UploadImageForm";
import { useBuffaloInfo } from "~/context/buffalo-info.context";

export const getServerSideProps: GetServerSideProps = async () => ({
  props: {
    integrityEnabled:
      process.env.NODE_ENV !== "production" &&
      !!process.env.BUFFALO_INTEGRITY_ISOLATED_CONFIG,
  },
});
const NewBuffaloInfoMainPage = ({
  integrityEnabled,
}: {
  integrityEnabled: boolean;
}) => {
  const { step } = useBuffaloInfo();
  return (
    <BaseLayout title="New Buffalo Info">
      {integrityEnabled ? (
        <DurableCreate />
      ) : (
        <div className="flex w-full items-center justify-center">
          {step == 0 ? <NewBuffaloForm /> : null}
          {step == 1 ? <UploadImageForm /> : null}
          {step == 2 ? <MetadataGenerate /> : null}
          {step == 3 ? <Minting /> : null}
        </div>
      )}
    </BaseLayout>
  );
};

export default NewBuffaloInfoMainPage;
