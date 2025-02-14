import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_supabase_url!,
  process.env.NEXT_PUBLIC_supabase_key!,
);

export const getImageUrl = (path: string, test: boolean) => {
  return test
    ? supabase.storage.from("test/buffalo").getPublicUrl(path).data.publicUrl
    : supabase.storage.from("slipstorage/buffalo").getPublicUrl(path).data
        .publicUrl;
};

export const getJsonUrl = (path: string, test: boolean) => {
  return test
    ? supabase.storage.from("test/json").getPublicUrl(path).data.publicUrl
    : supabase.storage.from("slipstorage/json").getPublicUrl(path).data
        .publicUrl;
};

export const getAvatarUrl = (path: string) => {
  return supabase.storage.from("slipstorage/avatar").getPublicUrl(path).data
    .publicUrl;
};

export const getRewardUrl = (path: string) => {
  if (path == "") return null;
  return supabase.storage.from("slipstorage/reward").getPublicUrl(path).data
    .publicUrl;
};

export const getDNAUrl = (path: string) => {
  if (path == "") return null;
  return supabase.storage.from("slipstorage/dna").getPublicUrl(path).data
    .publicUrl;
};
