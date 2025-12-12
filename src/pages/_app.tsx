import { Kanit, Inter } from "next/font/google";
import { type AppType } from "next/app";
import { api } from "~/utils/api";
import "~/styles/globals.css";
import { AuthProvider } from "~/context/auth.context";
import { BuffaloInfoProvider } from "~/context/buffalo-info.context";
import { Toaster } from "react-hot-toast";

const kanit = Kanit({
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-kanit",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-inter",
  display: "swap",
});

const MyApp: AppType = ({ Component, pageProps }) => {
  return (
    <div className={`${kanit.variable} ${inter.variable} font-kanit`} data-theme="halloween">
      <AuthProvider>
        <BuffaloInfoProvider>
          <Component {...pageProps} />
          <Toaster position="top-right" />
        </BuffaloInfoProvider>
      </AuthProvider>
    </div>
  );
};

export default api.withTRPC(MyApp);
