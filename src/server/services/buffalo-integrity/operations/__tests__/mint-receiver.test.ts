/** @jest-environment node */
import { verifiedMintToken } from "../loopback";

const sender = "0x4c06524b1bd7aa002747252257bbe0c472735a6d";
const receiver = "0xd0fbb6e65b81bafe6dd6ea112ca7154368683c7c";
const expected = { receiver, tokenUri: "provisional.json" };
const event = {
  operator: receiver,
  _tokenId: 1369n,
  _tokenURI: expected.tokenUri,
};

test("accepts the intended recipient reported by the NFT contract", () => {
  expect(verifiedMintToken(event, expected)).toBe(1369n);
});

test("rejects a mint event reporting the signer instead of the intended recipient", () => {
  expect(() =>
    verifiedMintToken({ ...event, operator: sender }, expected),
  ).toThrow("MINT_EVENT_BINDING_MISMATCH");
});
