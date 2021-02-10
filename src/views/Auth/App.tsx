import React, { useEffect, useState } from "react";
import { Button, Input, Spacer, useInput, Loading } from "@geist-ui/react";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "../../stores/reducers";
import { sendMessage, MessageType } from "../../utils/messenger";
import { setPermissions } from "../../stores/actions";
import { getRealURL } from "../../utils/url";
import {
  PermissionType,
  PermissionDescriptions
} from "../../utils/permissions";
import { JWKInterface } from "arweave/web/lib/wallet";
import Arweave from "arweave";
import { CreateTransactionInterface } from "arweave/web/common";
import { SignatureOptions } from "arweave/node/lib/crypto/crypto-interface";
import Cryptr from "cryptr";
import styles from "../../styles/views/Auth/view.module.sass";

export default function App() {
  const passwordInput = useInput(""),
    [passwordStatus, setPasswordStatus] = useState<
      "default" | "secondary" | "success" | "warning" | "error"
    >(),
    wallets = useSelector((state: RootState) => state.wallets),
    [loading, setLoading] = useState(false),
    [loggedIn, setLoggedIn] = useState(false),
    permissions = useSelector((state: RootState) => state.permissions),
    [requestedPermissions, setRequestedPermissions] = useState<
      PermissionType[]
    >([]),
    [currentURL, setCurrentURL] = useState<string>(),
    [type, setType] = useState<AuthType>(),
    dispatch = useDispatch(),
    [alreadyHasPermissions, setAlreadyHasPermissions] = useState(false),
    [attributes, setAttributes] = useState<
      Partial<CreateTransactionInterface>
    >(),
    profile = useSelector((state: RootState) => state.profile),
    [signingOptions, setSigningOptions] = useState<
      SignatureOptions | undefined
    >();

  useEffect(() => {
    // get the auth param from the url
    const authVal = new URL(window.location.href).searchParams.get("auth");

    // invalid auth
    if (!authVal) {
      sendMessage({
        type: getReturnType(),
        ext: "weavemask",
        res: false,
        message: "Invalid auth call",
        sender: "popup"
      });
      window.close();
      return;
    }

    // decode the auth param from the authVal
    const decodedAuthParam: {
      permissions?: PermissionType[];
      type?: AuthType;
      url?: string;
      attributes?: Partial<CreateTransactionInterface>;
      signingOptions?: SignatureOptions;
    } = JSON.parse(decodeURIComponent(authVal));

    // if the type does not exist, this is an invalid call
    if (!decodedAuthParam.type) {
      sendMessage({
        type: getReturnType(),
        ext: "weavemask",
        res: false,
        message: "Invalid auth call",
        sender: "popup"
      });
      window.close();
      return;
    } else setType(decodedAuthParam.type);

    // get the current tab url from the decoded auth val
    let url = decodedAuthParam.url;
    if (!url) return urlError();
    setCurrentURL(getRealURL(url));
    url = getRealURL(url);

    // connect event
    if (decodedAuthParam.type === "connect" && decodedAuthParam.permissions) {
      // get the existing permissions
      const existingPermissions = permissions.find(
        (permGroup) => permGroup.url === url
      );

      // set the requested permissions to all requested
      setRequestedPermissions(decodedAuthParam.permissions);

      // filter the requested permissions: only display/ask for permissions
      // that the url does not have yet
      if (existingPermissions && existingPermissions.permissions.length > 0) {
        setAlreadyHasPermissions(true);
        setRequestedPermissions(
          decodedAuthParam.permissions.filter(
            (perm) => !existingPermissions.permissions.includes(perm)
          )
        );
      }

      // create transaction event
    } else if (
      decodedAuthParam.type === "create_transaction" &&
      decodedAuthParam.attributes
    ) {
      // check permissions
      if (!checkPermissions(["CREATE_TRANSACTION"], url))
        return sendPermissionError();

      // set tx attributes and signing options
      setAttributes(decodedAuthParam.attributes);
      setSigningOptions(decodedAuthParam.signingOptions);

      // if non of the types matched, this is an invalid auth call
    } else {
      sendMessage({
        type: getReturnType(),
        ext: "weavemask",
        res: false,
        message: "Invalid auth call",
        sender: "popup"
      });
      window.close();
      return;
    }

    // send cancel event if the popup is closed by the user
    window.addEventListener("beforeunload", cancel);

    return function cleanup() {
      window.removeEventListener("beforeunload", cancel);
    };
    // eslint-disable-next-line
  }, []);

  // decrypt current wallet
  async function login() {
    setLoading(true);
    // we need to wait a bit, because the decrypting
    // freezes the program, and the loading does not start
    setTimeout(() => {
      // try to login by decrypting
      try {
        const cryptr = new Cryptr(passwordInput.state),
          keyfileToDecrypt = wallets.find(({ address }) => address === profile)
            ?.keyfile;

        if (!keyfileToDecrypt) {
          setPasswordStatus("error");
          setLoading(false);
          return;
        }
        const decryptedKeyfile = cryptr.decrypt(keyfileToDecrypt);
        setLoggedIn(true);

        // any event that needs authentication, but not the connect event
        if (type !== "connect") {
          if (!currentURL) return urlError();
          else handleNonPermissionAction(JSON.parse(decryptedKeyfile));

          // connect event
        } else {
          setLoggedIn(true);
          setLoading(false);
        }
      } catch {
        setPasswordStatus("error");
        setLoading(false);
      }
    }, 70);
  }

  // invalid url sent
  function urlError() {
    sendMessage({
      type: getReturnType(),
      ext: "weavemask",
      res: false,
      message: "No tab selected",
      sender: "popup"
    });
    window.close();
  }

  // get the type that needs to be returned in the message
  function getReturnType(): MessageType {
    if (type === "connect") return "connect_result";
    else if (type === "create_transaction") return "create_transaction_result";
    //
    return "connect_result";
  }

  // accept permissions
  function accept() {
    if (!loggedIn) return;
    if (!currentURL) return urlError();

    const currentPerms: PermissionType[] =
      permissions.find(({ url }) => url === currentURL)?.permissions ?? [];
    dispatch(
      setPermissions(currentURL, [...currentPerms, ...requestedPermissions])
    );
    sendMessage({
      type: getReturnType(),
      ext: "weavemask",
      res: true,
      message: "Success",
      sender: "popup"
    });
    window.close();
  }

  // cancel login or permission request
  function cancel() {
    sendMessage({
      type: getReturnType(),
      ext: "weavemask",
      res: false,
      message: "User cancelled the login",
      sender: "popup"
    });
    window.close();
  }

  // return the description of a permission
  function getPermissionDescription(permission: PermissionType) {
    return PermissionDescriptions[permission];
  }

  // actions that are not connect
  async function handleNonPermissionAction(keyfile: JWKInterface) {
    if (!attributes) {
      sendMessage({
        type: getReturnType(),
        ext: "weavemask",
        res: false,
        message: "No attributes object submitted",
        sender: "popup"
      });
      setLoading(false);
      window.close();
      return;
    }

    try {
      // create a transaction object, and set it to the existing transaction
      // if it had been submitted for signing
      const arweave = new Arweave({
          host: "arweave.net",
          port: 443,
          protocol: "https"
        }),
        transaction = await arweave.createTransaction(attributes, keyfile);

      transaction.addTag("App-Name", "WeaveMask 0.1.0");
      await arweave.transactions.sign(transaction, keyfile, signingOptions);

      // smaller transactions
      if (!transaction.data) {
        await arweave.transactions.post(transaction);
      } else {
        const uploader = await arweave.transactions.getUploader(transaction);

        while (!uploader.isComplete) await uploader.uploadChunk();
      }

      sendMessage({
        type: getReturnType(),
        ext: "weavemask",
        res: true,
        message: "Success",
        sender: "popup",
        transactionID: transaction.id
      });
    } catch {
      sendMessage({
        type: getReturnType(),
        ext: "weavemask",
        res: false,
        message: "Error creating transaction",
        sender: "popup"
      });
    }

    setLoading(false);
    window.close();
  }

  // problem with permissions
  function sendPermissionError() {
    sendMessage({
      type: getReturnType(),
      ext: "weavemask",
      res: false,
      message:
        "The site does not have the required permissions for this action",
      sender: "popup"
    });
  }

  function checkPermissions(permissionsToCheck: PermissionType[], url: string) {
    const perms =
      permissions.find((permItem) => permItem.url === url)?.permissions ?? [];

    for (const pm of permissionsToCheck) if (!perms.includes(pm)) return false;

    return true;
  }

  return (
    <div className={styles.Auth}>
      {(!loggedIn && (
        <>
          <h1>Sign In</h1>
          {(type === "connect" && (
            <p>
              This site wants to connect to WeaveMask. Please enter your
              password to continue.
            </p>
          )) || (
            <p>
              This site wants to create a transaction. Please enter your
              password to continue.
            </p>
          )}
          <Input
            {...passwordInput.bindings}
            status={passwordStatus}
            placeholder="Password..."
            type="password"
            onKeyPress={(e) => {
              if (e.key === "Enter") login();
            }}
          />
          <Spacer />
          <Button
            style={{ width: "100%" }}
            onClick={login}
            loading={loading}
            type="success"
          >
            Log In
          </Button>
          <Spacer />
          <Button style={{ width: "100%" }} onClick={cancel}>
            Cancel
          </Button>
          <h2 className={styles.th8ta}>
            th<span>8</span>ta
          </h2>
        </>
      )) ||
        (type === "connect" && (
          <>
            <h1>Permissions</h1>
            {(alreadyHasPermissions && (
              <p>This site wants to access more permissions:</p>
            )) || <p>Please allow these permissions for this site</p>}
            {(requestedPermissions.length > 0 && (
              <ul>
                {requestedPermissions.map((permission, i) => (
                  <li key={i}>{getPermissionDescription(permission)}</li>
                ))}
              </ul>
            )) || <p>No permissions requested.</p>}
            <Spacer />
            <Button style={{ width: "100%" }} onClick={accept} type="success">
              Accept
            </Button>
            <Spacer />
            <Button style={{ width: "100%" }} onClick={cancel}>
              Cancel
            </Button>
          </>
        )) || (
          <p
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              textAlign: "center",
              width: "75%"
            }}
          >
            <Loading style={{ display: "block", margin: "0 auto" }} />
            {type === "create_transaction" &&
              "Creating and posting a transaction."}
          </p>
        )}
    </div>
  );
}

type AuthType = "connect" | "create_transaction";
