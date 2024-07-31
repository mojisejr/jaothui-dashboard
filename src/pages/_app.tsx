import { GeistSans } from "geist/font/sans";
import { type AppType } from "next/app";
import { api } from "~/utils/api";
import "~/styles/globals.css";
import { AuthProvider } from "~/context/auth.context";
import { BuffaloInfoProvider } from "~/context/buffalo-info.context";

const MyApp: AppType = ({ Component, pageProps }) => {
  return (
    <div className={GeistSans.className} data-theme="halloween">
      <AuthProvider>
        <BuffaloInfoProvider>
          <Component {...pageProps} />
        </BuffaloInfoProvider>
      </AuthProvider>
    </div>
  );
};

export default api.withTRPC(MyApp);
