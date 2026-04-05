import config from "@app/lib/api/config";
import { WorkOS } from "@workos-inc/node";

let workos: WorkOS | null = null;

// When using fake-workos, API calls go to the Docker hostname (fake-workos:7600)
// but authorization URLs need the browser-accessible hostname (localhost:7600).
let authorizeHostname: string | null = null;

export function getWorkOS() {
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  if (!workos) {
    const apiHostname = process.env.WORKOS_API_HOSTNAME || "auth-api.dust.tt";
    authorizeHostname = process.env.WORKOS_AUTHORIZE_HOSTNAME || null;
    const useHttps =
      !apiHostname.startsWith("fake-workos") &&
      !apiHostname.startsWith("localhost");
    workos = new WorkOS(config.getWorkOSApiKey(), {
      clientId: config.getWorkOSClientId(),
      apiHostname,
      https: useHttps,
    });
  }

  return workos;
}

/**
 * Rewrite an authorization URL to use the browser-accessible hostname
 * when running with fake-workos in Docker.
 */
export function rewriteAuthorizeUrl(url: string): string {
  if (authorizeHostname) {
    const apiHostname = process.env.WORKOS_API_HOSTNAME || "";
    // Replace both http:// and https:// variants (the SDK may use either)
    return url
      .replace(`https://${apiHostname}`, `http://${authorizeHostname}`)
      .replace(`http://${apiHostname}`, `http://${authorizeHostname}`);
  }
  return url;
}
