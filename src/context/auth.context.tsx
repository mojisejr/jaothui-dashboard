import { useRouter } from "next/router";
import {
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";
import { api } from "~/utils/api";
import {
  rememberCompetitionReturn,
  consumeCompetitionReturn,
  clearCompetitionReturn,
} from "~/lib/competition-return-target";

type authContextType = {
  login: (username: string, password: string) => void;
  logout: () => void;
  isAuth: boolean;
  token: string | null;
  isPending: boolean;
  isSuccess: boolean;
  isError: boolean;
};

const authContextDefaultValue: authContextType = {
  login: () => ({}),
  logout: () => ({}),
  isAuth: false,
  token: null,
  isPending: false,
  isSuccess: false,
  isError: false,
};

const AuthContext = createContext<authContextType>(authContextDefaultValue);

type Props = {
  children: ReactNode;
};

export function AuthProvider({ children }: Props) {
  const [isAuth, setAuth] = useState<boolean>(false);
  const [token, setToken] = useState<string | null>(null);
  const { replace, asPath, isReady } = useRouter();

  const { data, isPending, isSuccess, isError, mutate, error } =
    api.auth.login.useMutation();

  useEffect(() => {
    if (isReady === false) return;
    const token = getToken();
    if (!token) {
      rememberCompetitionReturn(asPath);
      if (asPath !== "/") void replace("/");
    } else {
      setToken(token);
      setAuth(true);
    }

    // if (isAuth && token) {
    //   replace("/dashboard");
    // }
  }, [asPath, isReady, replace]);

  useEffect(() => {
    if (isError && error != null) {
      setAuth(false);
      alert(
        error.data?.code === "UNAUTHORIZED"
          ? "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง"
          : "ติดต่อระบบเข้าสู่ระบบไม่สำเร็จ กรุณาลองอีกครั้ง",
      );
    }
  }, [isError, error]);

  useEffect(() => {
    if (isSuccess && data != undefined && error == null) {
      localStorage.setItem("jaothui-jwt", data);
      setToken(data);
      setAuth(true);
      void replace(consumeCompetitionReturn());
    }
  }, [isSuccess, data, error, replace]);

  const login = (username: string, password: string) => {
    mutate({ username, password });
  };

  const logout = () => {
    setAuth(false);
    resetToken();
    clearCompetitionReturn();
    void replace("/");
  };

  const getToken = () => {
    return localStorage.getItem("jaothui-jwt");
  };

  const resetToken = () => {
    localStorage.removeItem("jaothui-jwt");
    setToken(null);
  };

  const value = {
    login,
    logout,
    isAuth,
    token,
    isPending,
    isSuccess,
    isError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
