import { IGatewayConfig } from "../stores/reducers/arweave";
import { concatGatewayURL } from "../utils/gateways";

export function getRedirectURL(url: URL, gateway: IGatewayConfig) {
  let redirectURL: string | undefined = undefined;

  // "ar://" url
  const arURL = url.searchParams.get("q");

  if (!arURL || arURL === "") {
    return redirectURL;
  }

  // value (address / permapage / id)
  const value = arURL.replace("ar://", "");

  if (!value || value === "") {
    return redirectURL;
  }

  redirectURL = concatGatewayURL(gateway) + "/" + value;

  // if it is not an Arweave ID, redirect to permapages
  if (!/[a-z0-9_-]{43}/i.test(value)) {
    redirectURL = `https://${value}.arweave.dev`;
  }

  return redirectURL;
}
