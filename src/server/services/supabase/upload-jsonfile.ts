/** Protected aliases are written only by the server-owned durable asset coordinator. */
export const uploadJson = async (
  _tokenId: number,
  _metadata: string,
): Promise<never> => {
  throw new Error("LEGACY_WRITE_REQUIRES_DURABLE_OPERATION");
};
