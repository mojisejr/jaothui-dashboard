import { viemPublic } from "./viem";
import { abi, address } from "./metadata-maneger/abi";
import { abi as nftAbi, address as nftAddress } from "./nft/abi";
import { type IMetadata } from "~/interfaces/i-metadata";
import { getJsonUrl, getImageUrl } from "../services/supabase/supabase";
import axios from "axios";
import { type JsonMetadata } from "~/interfaces/i-metadata-json";
import { getByMicrochip } from "../services/buffalo.service";
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

export const mintNFT = async (_tokenId: number) => {
  throw new Error("LEGACY_WRITE_REQUIRES_DURABLE_OPERATION");
};

export const addMetadata = async (_tokenId: number) => {
  throw new Error("LEGACY_WRITE_REQUIRES_DURABLE_OPERATION");
};

export const addMetadataBatch = async (_tokenId: number) => {
  throw new Error("LEGACY_WRITE_REQUIRES_DURABLE_OPERATION");
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
  _tokenId: number,
  _oldMicrochip: string,
  _microchip: string,
) => {
  throw new Error("LEGACY_WRITE_REQUIRES_DURABLE_OPERATION");
};

export const updateBuffaloBirthday = async (
  _tokenId: number,
  _microchip: string,
  _birthday: Date,
) => {
  throw new Error("LEGACY_WRITE_REQUIRES_DURABLE_OPERATION");
};

export const updateBuffaloCertNo = async (
  _tokenId: number,
  _microchip: string,
  _certNo: string,
) => {
  throw new Error("LEGACY_WRITE_REQUIRES_DURABLE_OPERATION");
};

export const updateBuffaloColor = async (
  _tokenId: number,
  _microchip: string,
  _color: string,
) => {
  throw new Error("LEGACY_WRITE_REQUIRES_DURABLE_OPERATION");
};

export const updateBuffaloDetail = async (
  _tokenId: number,
  _microchip: string,
  _detail: string,
) => {
  throw new Error("LEGACY_WRITE_REQUIRES_DURABLE_OPERATION");
};

export const updateBuffaloDna = async (
  _tokenId: number,
  _microchip: string,
  _dna: string,
) => {
  throw new Error("LEGACY_WRITE_REQUIRES_DURABLE_OPERATION");
};

export const updateBuffaloHeight = async (
  _tokenId: number,
  _microchip: string,
  _height: number,
) => {
  throw new Error("LEGACY_WRITE_REQUIRES_DURABLE_OPERATION");
};

export const updateBuffaloName = async (
  _tokenId: number,
  _microchip: string,
  _name: string,
) => {
  throw new Error("LEGACY_WRITE_REQUIRES_DURABLE_OPERATION");
};

export const updateBuffaloOrigin = async (
  _tokenId: number,
  _microchip: string,
  _origin: string,
) => {
  throw new Error("LEGACY_WRITE_REQUIRES_DURABLE_OPERATION");
};

export const updateBuffaloRarity = async (
  _tokenId: number,
  _microchip: string,
  _rarity: string,
) => {
  throw new Error("LEGACY_WRITE_REQUIRES_DURABLE_OPERATION");
};

export const updateBuffaloSex = async (
  _tokenId: number,
  _microchip: string,
  _sex: string,
) => {
  throw new Error("LEGACY_WRITE_REQUIRES_DURABLE_OPERATION");
};

export const updateParentId = async (
  _microchip: string,
  _motherMicrochip: string,
  _fatherMicrochip: string,
) => {
  throw new Error("LEGACY_WRITE_REQUIRES_DURABLE_OPERATION");
};

export const updateDNAOnChain = async (_tokenId: string, _dnaUrl: string) => {
  throw new Error("LEGACY_WRITE_REQUIRES_DURABLE_OPERATION");
};
