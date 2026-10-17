import { account, viemPublic, viemWallet } from "./viem";
import { abi, address } from "./metadata-maneger/abi";
import { abi as nftAbi, address as nftAddress } from "./nft/abi";
import { type IMetadata } from "~/interfaces/i-metadata";
import { getJsonUrl, getImageUrl } from "../services/supabase/supabase";
import axios from "axios";
import { type JsonMetadata } from "~/interfaces/i-metadata-json";
import { getByMicrochip } from "../services/buffalo.service";
import { db } from "../db";
import { readBuffaloMetadata } from "../services/buffalo-integrity/read";
import {
  metadataDomain,
  readChainIdentity,
} from "../services/buffalo-integrity/chain-read";

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

export const addMetadata = async (tokenId: number) => {
  try {
    const metadataForManager = await createMetadataForManager(tokenId);
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

export const addMetadataBatch = async (tokenId: number) => {
  try {
    const metadataForManager = await createMetadataForManager(tokenId);
    const { request: metadataRequest } = await viemPublic.simulateContract({
      account: account,
      address: address,
      abi: abi,
      functionName: "addMetadataBatch",
      args: [[tokenId.toString()], [metadataForManager]],
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

export const createMetadataForManager = async (tokenId: number) => {
  const url = getJsonUrl(`${tokenId.toString()}.json`, false);
  const response = await axios.get<JsonMetadata>(url);
  const data: JsonMetadata = response.data;

  /**
   *    string name; 1
        string microchip; 2
        string certNo;  3
        string origin; 4
        string color; 5
        string imageUri; 6
        string detail; 7
        string sex; 8
        string rarity; 9
        uint256 birthdate; 10s
        uint256 height; 11
        uint256 issuedAt; 12
   */

  const metadataForManager = [
    data.name == "" ? "N/A" : data.name.trim().split(" #")[0], //1
    data.attributes[1]?.value.toString() == ""
      ? "N/A"
      : data.attributes[1]?.value.toString(), //2
    "N/A", //3
    // data.certNo == "" ? "N/A" : data.certNo,
    data.attributes[4]?.value == "" ? "N/A" : data.attributes[4]?.value, //4
    data.attributes[3]?.value == "" ? "N/A" : data.attributes[3]?.value, //5
    data.image, //6
    "N/A", //7
    // data.detail == "" ? "N/A" : data.detail,
    data.attributes[0]?.value == "" ? "N/A" : data.attributes[0]?.value, //8
    data.attributes[6]?.value == "" ? "Normal" : data.attributes[6]?.value, //9
    Math.floor(new Date(data.attributes[2]?.value ?? 0).getTime() / 1000) <= 0
      ? 0
      : Math.floor(new Date(data.attributes[2]?.value ?? 0).getTime() / 1000), //10
    // data.attributes[5]?.value ? 0 : parseInt(data.attributes[5]?.value ?? "0"), //11
    parseInt(data.attributes[5]?.value ?? "0"), //11
    Math.floor(new Date().getTime() / 1000), //12
  ];

  return metadataForManager;
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

export const getMetadataByMicrochipId = async (microchipId: string) => {
  return readBuffaloMetadata(microchipId, metadataDomain, {
    findCow: getByMicrochip,
    readChain: readChainIdentity,
    imageForCow: (cow) => getImageUrl(`${cow.tokenId.toString()}.jpg`, false),
  });
};

export const updateBuffaloMicrochip = async (
  tokenId: number,
  oldMicrochip: string,
  microchip: string,
) => {
  try {
    const result = await addMetadataBatch(tokenId);
    if (result) {
      await db.pedigree.update({
        where: { microchip: oldMicrochip },
        data: { microchip: microchip },
      });
    }
    return true;
  } catch (error) {
    return false;
  }
};

export const updateBuffaloBirthday = async (
  tokenId: number,
  microchip: string,
  birthday: Date,
) => {
  const result = await addMetadataBatch(tokenId);
  if (result) {
    await db.pedigree.update({
      where: { microchip },
      data: { birthday: birthday },
    });
  }
};

export const updateBuffaloCertNo = async (
  tokenId: number,
  microchip: string,
  certNo: string,
) => {
  const result = await addMetadataBatch(tokenId);
  if (result) {
    await db.pedigree.update({
      where: { microchip },
      data: { certNo: certNo },
    });
  }
};

export const updateBuffaloColor = async (
  tokenId: number,
  microchip: string,
  color: string,
) => {
  const result = await addMetadataBatch(tokenId);
  if (result) {
    await db.pedigree.update({
      where: { microchip },
      data: { color: color },
    });
  }
};

export const updateBuffaloDetail = async (
  tokenId: number,
  microchip: string,
  detail: string,
) => {
  const result = await addMetadataBatch(tokenId);
  if (result) {
    await db.pedigree.update({
      where: { microchip },
      data: { detail: detail },
    });
  }
};

export const updateBuffaloDna = async (
  tokenId: number,
  microchip: string,
  dna: string,
) => {
  const result = await addMetadataBatch(tokenId);
  if (result) {
    await db.pedigree.update({
      where: { microchip },
      data: { dna: dna },
    });
  }
};

export const updateBuffaloHeight = async (
  tokenId: number,
  microchip: string,
  height: number,
) => {
  const result = await addMetadataBatch(tokenId);
  if (result) {
    await db.pedigree.update({
      where: { microchip },
      data: { height: height },
    });
  }
};

export const updateBuffaloName = async (
  tokenId: number,
  microchip: string,
  name: string,
) => {
  const result = await addMetadataBatch(tokenId);
  if (result) {
    await db.pedigree.update({
      where: { microchip },
      data: { name: name },
    });
  }
};

export const updateBuffaloOrigin = async (
  tokenId: number,
  microchip: string,
  origin: string,
) => {
  const result = await addMetadataBatch(tokenId);
  if (result) {
    await db.pedigree.update({
      where: { microchip },
      data: { origin: origin },
    });
  }
};

export const updateBuffaloRarity = async (
  tokenId: number,
  microchip: string,
  rarity: string,
) => {
  const result = await addMetadataBatch(tokenId);
  if (result) {
    await db.pedigree.update({
      where: { microchip },
      data: { rarity: rarity },
    });
  }
};

export const updateBuffaloSex = async (
  tokenId: number,
  microchip: string,
  sex: string,
) => {
  const result = await addMetadataBatch(tokenId);
  if (result) {
    await db.pedigree.update({
      where: { microchip },
      data: { sex: sex },
    });
  }
};

export const updateParentId = async (
  microchip: string,
  motherMicrochip: string,
  fatherMicrochip: string,
) => {
  try {
    const target = await db.pedigree.findFirst({
      where: { microchip: microchip },
    });

    const { request: metadataRequest } = await viemPublic.simulateContract({
      account: account,
      address: address,
      abi: abi,
      functionName: "setParent",
      args: [target?.tokenId, fatherMicrochip, motherMicrochip],
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

export const updateDNAOnChain = async (tokenId: string, dnaUrl: string) => {
  try {
    const { request: dnaUpdateRequest } = await viemPublic.simulateContract({
      account: account,
      address: address,
      abi: abi,
      functionName: "setDNA",
      args: [parseInt(tokenId), dnaUrl],
    });

    const dna = await viemWallet.writeContract(dnaUpdateRequest);
    if (dna) {
      return true;
    } else {
      return false;
    }
  } catch (error) {
    console.log(error);
    return false;
  }
};
