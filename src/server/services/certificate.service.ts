import { TRPCError } from "@trpc/server";
import { db } from "../db";

export type CreateCertificateBypassInput = {
  microchip: string;
  slipUrl: string;
  bornAt?: string;
  wallet?: string;
  ownerName?: string;
};

export const createCertificateBypass = async (
  input: CreateCertificateBypassInput,
) => {
  try {
    const {
      microchip,
      slipUrl,
      bornAt = "N/A",
      wallet = "0x0D97d89d690B8b692704CaC80bEBA49D9497d582",
      ownerName = "-",
    } = input;

    // 1. Verify Pedigree exists
    const pedigree = await db.pedigree.findUnique({ where: { microchip } });
    if (!pedigree) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Pedigree not found. Please register buffalo first.",
      });
    }

    // 2. Verify Owner User exists
    const ownerUser = await db.user.findUnique({ where: { wallet } });
    if (!ownerUser) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `Owner wallet not found: ${wallet}`,
      });
    }

    // 3. Verify Approvers exist (OPTIMIZED: batch query)
    const approverWallets = [
      "0xc83Bd471889c986F7D8e0d40C6994d9e5704018c",
      "0x0D97d89d690B8b692704CaC80bEBA49D9497d582",
      "0x97584869f231989153d361B7FC64197BdEBA819c",
    ];

    const approvers = await db.certificateApprover.findMany({
      where: {
        wallet: { in: approverWallets },
      },
    });

    if (approvers.length !== approverWallets.length) {
      const missingWallets = approverWallets.filter(
        (w) => !approvers.some((a) => a.wallet === w),
      );
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `Approvers not found: ${missingWallets.join(", ")}`,
      });
    }

    // 4. Check existing Certificate
    const existingCert = await db.certificate.findUnique({
      where: { microchip },
      include: { approvers: true },
    });

    if (existingCert && existingCert.approvers.length > 0) {
      return {
        success: true,
        message: "Certificate already approved.",
        certificate: existingCert,
      };
    }

    // 5. Create or Update Certificate and Connect Approvers (Transaction)
    return await db.$transaction(async (tx) => {
      let cert;
      if (existingCert) {
        cert = await tx.certificate.update({
          where: { microchip },
          data: {
            slipUrl,
            bornAt,
            ownerName,
            isActive: true,
            wallet,
          },
        });
      } else {
        cert = await tx.certificate.create({
          data: {
            microchip,
            wallet,
            slipUrl,
            bornAt,
            ownerName,
            isActive: true,
          },
        });
      }

      // Connect approvers (OPTIMIZED: batch in single update)
      const approversToConnect = approverWallets.filter(
        (wallet) => !existingCert?.approvers.some((a) => a.wallet === wallet),
      );

      if (approversToConnect.length > 0) {
        await tx.certificate.update({
          where: { microchip },
          data: {
            approvers: {
              connect: approversToConnect.map((wallet) => ({ wallet })),
            },
          },
        });
      }

      return {
        success: true,
        message: "Certificate created and approved successfully.",
        certificate: cert,
      };
    });
  } catch (error) {
    if (error instanceof TRPCError) {
      throw error;
    }
    if (error instanceof Error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: error.message,
        cause: error,
      });
    }
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Unknown error during certificate creation",
    });
  }
};

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
