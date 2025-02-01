import { connect } from "http2";
import { db } from "../db";

export const searchAndCheckApprovment = async (microchip: string) => {
  const certificate = await db.certificate.findUnique({
    where: { microchip },
    include: {
      approvers: true,
    },
  });

  const buffalo = await db.pedigree.findUnique({ where: { microchip } });

  let merged;

  if (!certificate) {
    merged = {
      microchip: buffalo?.microchip,
      name: buffalo?.name,
      approved: false,
    };
    return merged;
  }

  merged = {
    microchip: buffalo?.microchip,
    name: buffalo?.name,
    approved: certificate.approvers.length <= 0 ? false : true,
  };

  return merged;
};

export const byPassApprovment = async (microchip: string) => {
  const approvers = [
    "0xc83Bd471889c986F7D8e0d40C6994d9e5704018c",
    "0x0D97d89d690B8b692704CaC80bEBA49D9497d582",
    "0x97584869f231989153d361B7FC64197BdEBA819c",
  ];
  let approved = 0;
  for (const approver of approvers) {
    await db.certificate.update({
      where: { microchip },
      data: {
        approvers: { connect: { wallet: approver } },
        isActive: true,
      },
      include: {
        approvers: true,
      },
    });
    approved += 1;
  }

  return approved == 3;
};
