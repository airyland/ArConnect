import type { PermissionType } from "~applications/permissions";
import { createContextMenus } from "~utils/context_menus";
import type { AppInfo } from "~applications/application";
import { getAppURL } from "~utils/format";
import type { ModuleFunction } from "~api/background";
import type { Gateway } from "~applications/gateway";
import { updateIcon } from "~utils/icon";
import validatePermissions from "./permissions";
import authenticate from "./auth";

const background: ModuleFunction<void> = async (
  tab,
  permissions: PermissionType[],
  appInfo: AppInfo = {},
  gateway?: Gateway
) => {
  // grab tab url
  const tabURL = getAppURL(tab.url);

  // validate requested permissions
  await validatePermissions(permissions, tabURL);

  // add app logo if there isn't one
  if (!appInfo.logo) {
    appInfo.logo = tab.favIconUrl;
  }

  try {
    // authenticate the user with the requested permissions
    await authenticate({
      type: "connect",
      url: tabURL,
      permissions,
      appInfo,
      gateway
    });

    // add features available after connection
    await updateIcon(true);
    createContextMenus(true);
  } catch (e: any) {
    await updateIcon(false);
    createContextMenus(false);

    throw new Error(e);
  }
};

export default background;