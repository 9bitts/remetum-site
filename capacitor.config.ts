import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.remetum.app",
  appName: "Remetum",
  webDir: "www",
  backgroundColor: "#0B0B0D",
  server: {
    url: "https://remetum.com",
    cleartext: false,
    androidScheme: "https",
    allowNavigation: ["remetum.com", "www.remetum.com", "*.remetum.com"],
  },
  android: {
    backgroundColor: "#0B0B0D",
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: "#0B0B0D",
      showSpinner: false,
    },
    StatusBar: {
      style: "LIGHT",
      backgroundColor: "#0B0B0D",
    },
  },
};

export default config;
