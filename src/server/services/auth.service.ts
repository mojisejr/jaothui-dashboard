import { TRPCError } from "@trpc/server";
import jwt from "jsonwebtoken";
export const login = async (username: string, password: string) => {
  if (username != process.env.username || password != process.env.password) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  if (username == process.env.username && password == process.env.password) {
    return jwt.sign(
      { username, iat: new Date().getTime() },
      process.env.secret!,
    );
  }
};
