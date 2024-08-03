import { account, viemPublic, viemWallet } from "./viem";
import { abi, address } from "./metadata-maneger/abi";
import { abi as nftAbi, address as nftAddress } from "./nft/abi";
import { IMetadata } from "~/interfaces/i-metadata";
import { getJsonUrl } from "../services/supabase/supabase";
import axios from "axios";
import { JsonMetadata } from "~/interfaces/i-metadata-json";
import { NewBuffaloInput } from "~/components/new-buffalo-info/NewBuffaloForm";

export const getAllMintedBuffalos = async () => {
  const metadata = (await viemPublic.readContract({
    address,
    abi,
    functionName: "getAllMetadata",
  })) as IMetadata[];

  const metadataWithTokenIds = metadata.map((data, index) => ({
    ...data,
    tokenId: index + 1,
  }));

  return metadataWithTokenIds;
};

export const mintNFT = async (tokenId: number) => {
  try {
    const url = getJsonUrl(`${tokenId.toString()}.json`, false);
    const response = await axios.get<JsonMetadata>(url);
    const data: JsonMetadata = response.data;

    const { request } = await viemPublic.simulateContract({
      account: account,
      address: nftAddress,
      abi: nftAbi,
      functionName: "mintWithMetadata",
      args: ["0xD0fBB6E65B81bafe6dd6ea112ca7154368683C7C", data.image, url],
    });

    // console.log(request);

    const minted = await viemWallet.writeContract(request);

    if (minted) {
      return true;
    } else {
      return false;
    }
  } catch (error) {
    console.log(error);
    return false;
  }
};

export const addMetadata = async (tokenId: number, input: NewBuffaloInput) => {
  try {
    const url = getJsonUrl(`${tokenId.toString()}.json`, false);
    const response = await axios.get<JsonMetadata>(url);
    const data: JsonMetadata = response.data;
    const metadataForManager = [
      input.name == "" ? "N/A" : input.name,
      input.microchip.toString() == "" ? "N/A" : input.microchip,
      input.certNo == "" ? "N/A" : input.certNo,
      input.origin == "" ? "N/A" : input.origin,
      input.color == "" ? "N/A" : input.color,
      data.image,
      input.detail == "" ? "N/A" : input.detail,
      input.sex == "" ? "N/A" : input.sex,
      input.rarity == "" ? "Normal" : input.rarity,
      +input.birthday / 1000 <= 0 ? 0 : +input.birthday / 1000,
      +input.height <= 0 ? 0 : +input.height,
      new Date().getTime(),
    ];

    const { request: metadataRequest } = await viemPublic.simulateContract({
      account: account,
      address: address,
      abi: abi,
      functionName: "addMetadata",
      args: [tokenId.toString(), metadataForManager],
    });

    const metadataAdded = await viemWallet.writeContract(metadataRequest);

    if (metadataAdded) {
      return true;
    } else {
      return false;
    }
  } catch (error) {
    console.log(error);
    return false;
  }
};

export const getCurrentTokenId = async () => {
  const tokenId = (await viemPublic.readContract({
    address: nftAddress,
    abi: nftAbi,
    functionName: "totalSupply",
  })) as bigint;

  const currentTokenId = tokenId + 1n;

  return +currentTokenId.toString();
};
