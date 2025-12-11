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
    throw new Error("Pedigree not found. Please register buffalo first.");
  }

  // 2. Verify Owner User exists
  const ownerUser = await db.user.findUnique({ where: { wallet } });
  if (!ownerUser) {
    throw new Error(`Owner wallet not found: ${wallet}`);
  }

  // 3. Verify Approvers exist
  const approverWallets = [
    "0xc83Bd471889c986F7D8e0d40C6994d9e5704018c",
    "0x0D97d89d690B8b692704CaC80bEBA49D9497d582",
    "0x97584869f231989153d361B7FC64197BdEBA819c",
  ];

  for (const approverWallet of approverWallets) {
    const approver = await db.certificateApprover.findUnique({
      where: { wallet: approverWallet },
    });
    if (!approver) {
      throw new Error(`Approver wallet not found: ${approverWallet}`);
    }
  }

  // 4. Check existing Certificate
  const existingCert = await db.certificate.findUnique({
    where: { microchip },
    include: { approvers: true },
  });

  if (existingCert) {
    if (existingCert.approvers.length > 0) {
      return {
        success: true,
        message: "Certificate already approved.",
        certificate: existingCert,
      };
    }
    // If exists but not approved, we proceed to update and connect approvers
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
          wallet, // Ensure owner wallet is set
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

    // Connect approvers
    for (const approverWallet of approverWallets) {
      // Check if already connected to avoid error?
      // Prisma connect is idempotent for many-to-many if using set, but here we use connect.
      // However, if we just want to ensure connection, we can try connect.
      // To be safe and avoid "Record to connect not found" (checked above) or unique constraint issues:
      // We can just call update with connect. If already connected, Prisma might throw error depending on version/schema.
      // Safe way: fetch current approvers, filter out existing.
      // But since we are in transaction and we know existingCert state...
      // Let's just use connect. If it fails due to already connected, we catch it?
      // Actually, for many-to-many, `connect` adds to the list. If already there, it might be fine or error.
      // Let's use `set` to be sure? No, `set` replaces all. We want to add specific ones.
      // Let's try connect. If it fails, it means something is wrong with data integrity or schema.
      // Wait, if we use `connect` on an existing relation, it might throw if unique constraint on join table is violated.
      // Let's check if already connected.

      const isConnected = existingCert?.approvers.some(
        (a) => a.wallet === approverWallet,
      );

      if (!isConnected) {
        await tx.certificate.update({
          where: { microchip },
          data: {
            approvers: { connect: { wallet: approverWallet } },
          },
        });
      }
    }

    return {
      success: true,
      message: "Certificate created and approved successfully.",
      certificate: cert,
    };
  });
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
