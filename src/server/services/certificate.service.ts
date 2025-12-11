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
  // [PHASE_B_LOG] Start
  const startTime = Date.now();
  console.log(`[PHASE_B_LOG] createCertificateBypass START - microchip: ${input.microchip}`);

  const {
    microchip,
    slipUrl,
    bornAt = "N/A",
    wallet = "0x0D97d89d690B8b692704CaC80bEBA49D9497d582",
    ownerName = "-",
  } = input;

  // 1. Verify Pedigree exists
  console.log(`[PHASE_B_LOG] Step 1: Checking pedigree...`);
  const step1Start = Date.now();
  const pedigree = await db.pedigree.findUnique({ where: { microchip } });
  console.log(`[PHASE_B_LOG] Step 1 completed in ${Date.now() - step1Start}ms`);
  if (!pedigree) {
    console.log(`[PHASE_B_LOG] ERROR: Pedigree not found - Total time: ${Date.now() - startTime}ms`);
    throw new Error("Pedigree not found. Please register buffalo first.");
  }

  // 2. Verify Owner User exists
  console.log(`[PHASE_B_LOG] Step 2: Checking owner user...`);
  const step2Start = Date.now();
  const ownerUser = await db.user.findUnique({ where: { wallet } });
  console.log(`[PHASE_B_LOG] Step 2 completed in ${Date.now() - step2Start}ms`);
  if (!ownerUser) {
    console.log(`[PHASE_B_LOG] ERROR: Owner user not found - Total time: ${Date.now() - startTime}ms`);
    throw new Error(`Owner wallet not found: ${wallet}`);
  }

  // 3. Verify Approvers exist
  console.log(`[PHASE_B_LOG] Step 3: Checking approvers...`);
  const step3Start = Date.now();
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
      console.log(`[PHASE_B_LOG] ERROR: Approver not found: ${approverWallet} - Total time: ${Date.now() - startTime}ms`);
      throw new Error(`Approver wallet not found: ${approverWallet}`);
    }
  }
  console.log(`[PHASE_B_LOG] Step 3 completed in ${Date.now() - step3Start}ms`);

  // 4. Check existing Certificate
  console.log(`[PHASE_B_LOG] Step 4: Checking existing certificate...`);
  const step4Start = Date.now();
  const existingCert = await db.certificate.findUnique({
    where: { microchip },
    include: { approvers: true },
  });
  console.log(`[PHASE_B_LOG] Step 4 completed in ${Date.now() - step4Start}ms - Certificate exists: ${!!existingCert}, Approvers connected: ${existingCert?.approvers.length ?? 0}`);

  if (existingCert) {
    if (existingCert.approvers.length > 0) {
      console.log(`[PHASE_B_LOG] Certificate already approved - Total time: ${Date.now() - startTime}ms`);
      return {
        success: true,
        message: "Certificate already approved.",
        certificate: existingCert,
      };
    }
    // If exists but not approved, we proceed to update and connect approvers
  }

  // 5. Create or Update Certificate and Connect Approvers (Transaction)
  console.log(`[PHASE_B_LOG] Step 5: Starting transaction...`);
  const step5Start = Date.now();
  return await db.$transaction(async (tx) => {
    let cert;
    console.log(`[PHASE_B_LOG] Step 5a: ${existingCert ? 'Updating' : 'Creating'} certificate...`);
    const step5aStart = Date.now();
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
    console.log(`[PHASE_B_LOG] Step 5a completed in ${Date.now() - step5aStart}ms`);

    // Connect approvers
    console.log(`[PHASE_B_LOG] Step 5b: Connecting approvers (loop)...`);
    const step5bStart = Date.now();
    let approverConnectCount = 0;
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
        const connectStart = Date.now();
        await tx.certificate.update({
          where: { microchip },
          data: {
            approvers: { connect: { wallet: approverWallet } },
          },
        });
        approverConnectCount++;
        console.log(`[PHASE_B_LOG] Step 5b: Connected approver ${approverWallet} in ${Date.now() - connectStart}ms`);
      }
    }
    console.log(`[PHASE_B_LOG] Step 5b completed in ${Date.now() - step5bStart}ms - Connected ${approverConnectCount} approvers`);
    console.log(`[PHASE_B_LOG] Step 5 (transaction) completed in ${Date.now() - step5Start}ms`);
    console.log(`[PHASE_B_LOG] createCertificateBypass SUCCESS - Total time: ${Date.now() - startTime}ms`);

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
