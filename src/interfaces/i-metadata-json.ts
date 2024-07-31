export interface JsonMetadata {
  name: string;
  edition: number;
  image: string;
  description: string;
  attributes: JsonMetadataAttribute[];
  hashtag: string[];
}

export interface JsonMetadataAttribute {
  trait_type: string;
  value: string;
}
