import type { PlatformType } from "@extension/shared/services/platform";
import { isValidPlatform } from "@extension/shared/services/platform";
import dotenv from "dotenv";
import { resolve } from "path";
import webpack from "webpack";

import { getConfig as getChromeConfig } from "../platforms/chrome/webpack.config";
import { getConfig as getFirefoxConfig } from "../platforms/firefox/webpack.config";
import { getConfig as getFrontConfig } from "../platforms/front/webpack.config";

const configPerPlatform: Record<PlatformType, any> = {
  chrome: getChromeConfig,
  front: getFrontConfig,
  firefox: getFirefoxConfig,
};

async function main() {
  process.env.DISABLE_EXTENSION_RELOADER = "1";
  dotenv.config({ path: resolve(__dirname, "../.env.development") });

  process.env.NEXT_PUBLIC_DUST_CLIENT_FACING_URL ??= process.env.DUST_US_URL;
  process.env.NEXT_PUBLIC_DUST_APP_URL ??= process.env.DUST_US_URL;

  const platform = process.argv
    .find((arg) => arg.startsWith("--platform="))
    ?.split("=")[1];

  if (!isValidPlatform(platform)) {
    throw new Error(`Unknown platform: ${platform}`);
  }

  const getConfig = configPerPlatform[platform];
  const config = await getConfig({ env: "development", shouldBuild: "none" });
  const compiler = webpack(config);

  return new Promise<void>((resolve, reject) => {
    compiler.run((err, stats) => {
      compiler.close((closeErr) => {
        if (closeErr) {
          console.error("Failed to close webpack compiler:", closeErr);
        }
      });

      if (err) {
        reject(err);
        return;
      }

      if (stats?.hasErrors()) {
        const info = stats.toJson();
        info.errors?.forEach((error) => console.error(error));
        reject(new Error("Webpack compilation failed."));
        return;
      }

      if (stats?.hasWarnings()) {
        const info = stats.toJson();
        info.warnings?.forEach((warning) => console.warn(warning));
      }

      resolve();
    });
  });
}

main().catch((err) => {
  console.error("Development build failed:", err);
  process.exit(1);
});
