import { db } from "../db";

export const getMemberId = async (wallet: string) => {
  const result = await db.user.findFirst({ where: { wallet } });
  return result;
};

export const updateWallet = async (
  memberId: number,
  walletToUpdate: string,
) => {
  const result = await db.user.update({
    where: { id: memberId },
    data: { wallet: walletToUpdate },
  });

  if (!result) {
    return false;
  }
  return true;
};
