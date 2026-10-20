/** Protected aliases are written only by the server-owned durable asset coordinator. */
export const uploadImage = async (
  _tokenId: number,
  _image: Buffer,
): Promise<never> => {
  throw new Error("LEGACY_WRITE_REQUIRES_DURABLE_OPERATION");
};
