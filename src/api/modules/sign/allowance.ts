import {
  getArweaveConfig,
  getStoreData,
  setStoreData
} from "../../../utils/background";
import { getRealURL } from "../../../utils/url";
import authenticate from "../connect/auth";
import Arweave from "arweave";

/**
 * Get all allowances
 */
async function getAllowances() {
  // fetch storage
  const storeData = await getStoreData();
  const allowances = storeData.allowances;

  if (!allowances) {
    throw new Error("No allowances object in storage");
  }

  return allowances;
}

/**
 * Get allowance for an app
 *
 * @param tabURL URL of the dApp
 */
export async function getAllowance(tabURL: string) {
  const allowances = await getAllowances();

  // allowance for the dApp
  const allowance = allowances.find(({ url }) => url === getRealURL(tabURL));

  return allowance;
}

/**
 * Verify if the user's allowance is enough for this transaction
 *
 * @param tabURL URL of the application
 * @param price Transaction price in winston
 *
 * @returns Whether the allowance is enough or not
 */
export async function checkAllowance(tabURL: string, price: number) {
  const allowance = await getAllowance(tabURL);

  // return if the allowance is not enabled
  if (!allowance || !allowance.enabled) return true;

  const arweave = new Arweave(await getArweaveConfig());

  // allowance in winston
  const allowanceWinston = parseInt(
    arweave.ar.arToWinston(allowance.limit.toString())
  );

  // spent amount after this transaction
  const total = allowance.spent + price;

  // check if the price goes over the allowed total limit
  return allowanceWinston >= total;
}

/**
 * Authenticate the user until they cancel, reset
 * their allowance or update it to have enough
 * for the submitted price
 *
 * @param price Price to check the allowance for (quantity + reward)
 */
export async function allowanceAuth(tabURL: string, price: number) {
  // compare allowance limit and tx price
  const hasEnoughAllowance = await checkAllowance(tabURL, price);

  // if the allowance is enough, return
  if (hasEnoughAllowance) return;

  // try to authenticate to raise the allowance amount
  await authenticate({
    type: "sign_auth",
    url: tabURL,
    spendingLimitReached: !hasEnoughAllowance
  });

  // call this function again, to check if the allowance
  // was reset or updated
  await allowanceAuth(tabURL, price);
}

/**
 * Update allowance for the current site
 *
 * @param price Price to update the allowance spent amount
 * with (quantity + reward)
 */
export async function updateAllowance(tabURL: string, price: number) {
  const allowances = await getAllowances();

  // re-map the allowance array with the new spent amount
  const updated = allowances.map((app) => {
    // only handle the given app
    if (app.url !== tabURL) return app;

    return {
      ...app,
      spent: app.spent + price
    };
  });

  // update store data
  await setStoreData({
    allowances: updated
  });
}
