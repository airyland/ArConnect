import React, { useEffect, useRef, useState } from "react";
import { Textarea, useToasts, useInput, Code } from "@geist-ui/react";
import { FileIcon } from "@primer/octicons-react";
import { JWKInterface } from "arweave/node/lib/wallet";
import { getKeyFromMnemonic } from "arweave-mnemonic-keys";
import { useDispatch, useSelector } from "react-redux";
import { Wallet } from "../../stores/reducers/wallets";
import { setWallets, switchProfile } from "../../stores/actions";
import { RootState } from "../../stores/reducers";
import { checkPassword as checkPw, setPassword } from "../../utils/auth";
import { browser } from "webextension-polyfill-ts";
import {
  Button,
  Input,
  useTheme,
  Tooltip,
  Spacer,
  Card,
  Modal,
  useModal
} from "@verto/ui";
import bip39 from "bip39-web-crypto";
import CryptoES from "crypto-es";
import Arweave from "arweave";
import logo from "../../assets/logo.png";
import styles from "../../styles/views/Welcome/view.module.sass";

export default function App() {
  const theme = useTheme(),
    fileInput = useRef<HTMLInputElement>(null),
    loadWalletsModal = useModal(false),
    [seed, setSeed] = useState<string>(),
    [setupConfig, setSetupConfig] = useState<SetupConfigProps>({
      welcome: false,
      password: false
    }),
    [, setToast] = useToasts(),
    [keyfiles, setKeyfiles] = useState<
      {
        keyfile: JWKInterface;
        filename?: string;
      }[]
    >([]),
    [loading, setLoading] = useState(false),
    dispatch = useDispatch(),
    walletsStore = useSelector((state: RootState) => state.wallets),
    seedModal = useModal(false),
    [seedKeyfile, setSeedKeyfile] = useState<{
      address: string;
      keyfile: JWKInterface;
    }>(),
    arweaveConfig = useSelector((state: RootState) => state.arweave),
    arweave = new Arweave(arweaveConfig),
    passwordInput = useInput(""),
    passwordInputAgain = useInput(""),
    [passwordGiven, setPasswordGiven] = useState(false),
    feeModal = useModal(false),
    loadConfigModal = useModal(),
    configPasswordInput = useInput(""),
    configFileInput = useRef<HTMLInputElement>(null),
    [configFilenameDisplay, setConfigFilenameDisplay] =
      useState("Click to load"),
    [loadingConfig, setLoadingConfig] = useState(false),
    inputStyles = {
      width: "89%",
      height: "1.99em",
      marginLeft: "1.2rem",
      background: "white",
      borderRadius: "14px",
      marginBottom: "1em",
      border: "3px solid #000"
    };

  useEffect(() => {
    if (!fileInput.current) return;
    const fileInputCurrent = fileInput.current;

    fileInputCurrent.addEventListener("change", loadFiles);

    return function cleanup() {
      fileInputCurrent.removeEventListener("change", loadFiles);
    };
    // eslint-disable-next-line
  }, [fileInput.current]);

  useEffect(() => {
    if (!configFileInput.current) return;
    const fileInputCurrent = configFileInput.current;
    const updateDisplay = () =>
      setConfigFilenameDisplay(
        fileInputCurrent.files?.[0].name ?? "Click to load"
      );

    fileInputCurrent.addEventListener("change", updateDisplay);

    return function cleanup() {
      fileInputCurrent.removeEventListener("change", updateDisplay);
    };
    // eslint-disable-next-line
  }, [configFileInput.current]);

  function loadFiles() {
    if (fileInput.current?.files)
      for (const file of fileInput.current.files) {
        if (file.type !== "application/json") continue;
        const reader = new FileReader();

        try {
          reader.readAsText(file);
        } catch {
          setToast({
            text: `There was an error when loading ${file.name}`,
            type: "error"
          });
        }

        reader.onabort = () =>
          setToast({ text: "File reading was aborted", type: "error" });
        reader.onerror = () =>
          setToast({ text: "File reading has failed", type: "error" });
        reader.onload = (e) => {
          try {
            const keyfile: JWKInterface = JSON.parse(
              e!.target!.result as string
            );
            setKeyfiles((val) => [...val, { keyfile, filename: file.name }]);
          } catch {
            setToast({
              text: "There was an error when loading a keyfile",
              type: "error"
            });
          }
        };
      }
  }

  async function login() {
    if (loading) return;
    setLoading(true);
    const keyfilesToLoad: JWKInterface[] = keyfiles.map(
        ({ keyfile }) => keyfile
      ),
      wallets: Wallet[] = [],
      walletsStoreEmpty = walletsStore.length < 1;

    if (seed) {
      const keyFromSeed: JWKInterface = await getKeyFromMnemonic(seed);
      keyfilesToLoad.push(keyFromSeed);
    }

    for (let i = 0; i < keyfilesToLoad.length; i++) {
      const address = await arweave.wallets.jwkToAddress(keyfilesToLoad[i]),
        keyfile = btoa(JSON.stringify(keyfilesToLoad[i])),
        name = `Account ${i + 1 + walletsStore.length}`;

      wallets.push({ address, keyfile, name });
    }

    dispatch(setWallets([...walletsStore, ...wallets]));
    if (walletsStoreEmpty) dispatch(switchProfile(wallets[0].address));
    setLoading(false);
    loadWalletsModal.setState(false);
    setToast({ text: "Loaded wallets", type: "success" });
    // allow time to save the wallets
    setTimeout(() => {
      loadWalletsModal.setState(false);
      setKeyfiles([]);
      if (fileInput.current) fileInput.current.value = "";
    }, 600);
  }

  async function createWallet() {
    setLoading(true);

    const mnemonic = await bip39.generateMnemonic(),
      keyfile: JWKInterface = await getKeyFromMnemonic(mnemonic),
      address = await arweave.wallets.jwkToAddress(keyfile),
      encryptedKeyfile = btoa(JSON.stringify(keyfile));

    setSeed(mnemonic);
    setSeedKeyfile({ address, keyfile });
    seedModal.setState(true);
    dispatch(
      setWallets([
        ...walletsStore,
        {
          keyfile: encryptedKeyfile,
          address,
          name: `Account ${walletsStore.length + 1}`
        }
      ])
    );
    dispatch(switchProfile(address));
    setLoading(false);
  }

  function downloadSeedWallet() {
    if (!seedKeyfile) return;
    const el = document.createElement("a");

    el.setAttribute(
      "href",
      `data:application/json;charset=utf-8,${encodeURIComponent(
        JSON.stringify(seedKeyfile.keyfile, null, 2)
      )}`
    );
    el.setAttribute("download", `arweave-keyfile-${seedKeyfile.address}.json`);
    el.style.display = "none";

    document.body.appendChild(el);
    el.click();
    document.body.removeChild(el);
  }

  async function createPassword() {
    if (passwordInput.state === "" || passwordInputAgain.state === "") {
      setToast({ text: "Please fill both password fields", type: "error" });
      return;
    }
    if (passwordInput.state !== passwordInputAgain.state) {
      setToast({ text: "The two passwords are not the same", type: "error" });
      return;
    }
    if (passwordInputAgain.state.length < 5) {
      setToast({ text: "Weak password", type: "error" });
      return;
    }

    await setPassword(passwordInput.state);
    setPasswordGiven(true);
  }

  async function checkPassword() {
    setLoading(true);
    try {
      const res = await checkPw(passwordInput.state);
      if (!res) throw new Error();

      setPasswordGiven(true);
      setToast({ text: "Logged in", type: "success" });
    } catch {
      setToast({ text: "Wrong password", type: "error" });
    }
    setLoading(false);
  }

  // TODO: Delete

  async function loadConfig() {
    if (
      !configFileInput.current?.files ||
      configFileInput.current.files.length === 0
    )
      return setToast({ text: "Please load your config file", type: "error" });

    // read config
    const file = configFileInput.current.files[0];

    if (file.type !== "text/plain")
      return setToast({ text: "Invalid file format", type: "error" });

    const reader = new FileReader();

    try {
      reader.readAsText(file);
    } catch {
      setToast({
        text: `There was an error when loading ${file.name}`,
        type: "error"
      });
    }

    reader.onabort = () =>
      setToast({ text: "File reading was aborted", type: "error" });
    reader.onerror = () =>
      setToast({ text: "File reading has failed", type: "error" });
    reader.onload = async (e) => {
      if (!e.target?.result)
        return setToast({ text: "Error reading the file", type: "error" });

      setLoadingConfig(true);
      // decrypt config and apply settings
      try {
        const decrypted = CryptoES.AES.decrypt(
          e.target.result as string,
          configPasswordInput.state
        );

        await setPassword(configPasswordInput.state);
        await browser.storage.local.set({
          "persist:root": decrypted.toString(CryptoES.enc.Utf8),
          decryptionKey: false
        });
        setToast({ text: "Loaded config", type: "success" });
        setTimeout(() => window.location.reload(), 1300);
      } catch {
        setToast({ text: "Invalid password", type: "error" });
      }
      setLoadingConfig(false);
      loadConfigModal.setState(false);
    };
  }

  const SetupPage = () => {
    return (
      <section className={styles.SetupPage}>
        <div>
          <img src={logo} alt="arconnect logo" className={styles.logo} />
          <h1 className={styles.header}>Welcome to ArConnect</h1>
          <p className={styles.intro}>
            A simple and secure way to authorize transactions and manage your
            Arweave assets
          </p>
          <Button
            small
            onClick={() => {
              setSetupConfig({ ...setupConfig, welcome: true });
            }}
            style={{ marginTop: "2rem" }}
          >
            Get Started
          </Button>
        </div>
      </section>
    );
  };

  return (
    <>
      {setupConfig.welcome ? (
        <div className={styles.Welcome}>
          {(passwordGiven && (
            <>
              <img src={logo} alt="arconnect logo" className={styles.logo} />
              <h1 className={styles.header}>Welcome to ArConnect</h1>
              <p className={styles.intro}>Load or create a new wallet.</p>
              <div className={styles.loadwallets}>
                <Button
                  onClick={() => {
                    loadWalletsModal.setState(true);
                  }}
                  small
                >
                  Load Wallet(s)
                </Button>
                <Button
                  onClick={createWallet}
                  small
                  loading={loading}
                  type="secondary"
                >
                  New Wallet
                </Button>
              </div>
              <p style={{ marginTop: "1.75em" }}>
                Read more about our{" "}
                <span
                  onClick={() => feeModal.setState(true)}
                  style={{
                    color: "#000",
                    cursor: "pointer",
                    fontWeight: "bold",
                    textDecoration: "underline"
                  }}
                >
                  fees
                </span>
                .
              </p>
            </>
          )) || (
            <>
              <img src={logo} alt="arconnect logo" className={styles.logo} />
              <h1 className={styles.header}>Welcome to ArConnect</h1>
              <p className={styles.intro}>
                {walletsStore.length === 0
                  ? "Please create a password to use for authentication"
                  : "Login with your password"}
              </p>
              <label className={`${styles.passwordLabel} ${styles.label1}`}>
                password
              </label>
              <Input
                {...passwordInput.bindings}
                onKeyPressHandler={(e) => {
                  if (e.key === "Enter" && walletsStore.length > 0) {
                    checkPassword();
                  } else if (e.key === "Enter" && walletsStore.length === 0) {
                    setToast({
                      text: "Please fill both password fields",
                      type: "error"
                    });
                  }
                }}
                type="password"
                placeholder="*********"
                style={{
                  ...inputStyles
                }}
              />
              {walletsStore.length === 0 && (
                <>
                  <Spacer />
                  <p className={styles.passwordLabel}>repeat password</p>
                  <Input
                    {...passwordInputAgain.bindings}
                    onKeyPressHandler={(e) => {
                      if (e.key === "Enter") {
                        createPassword();
                      }
                    }}
                    type="password"
                    placeholder="*********"
                    style={{
                      ...inputStyles
                    }}
                  />
                </>
              )}
              <Spacer />
              <Button
                small
                onClick={() => {
                  if (walletsStore.length === 0) createPassword();
                  else checkPassword();
                }}
                style={{ width: "15%" }}
              >
                {walletsStore.length === 0 ? "Create" : "Login"}
              </Button>

              {walletsStore.length === 0 && (
                <>
                  <span className={styles.OR}>OR</span>
                  <Button
                    type="secondary"
                    small
                    onClick={() => {
                      setSetupConfig({ ...setupConfig, welcome: false });
                    }}
                    style={{ width: "15%" }}
                  >
                    Cancel
                  </Button>
                </>
              )}
            </>
          )}
        </div>
      ) : (
        <SetupPage />
      )}
      <a
        className={styles.th8ta}
        href="https://th8ta.org"
        target="_blank"
        rel="noopener noreferrer"
      >
        th<span>8</span>ta
      </a>
      <Modal
        {...loadWalletsModal.bindings}
        open={loadWalletsModal.bindings.open}
        onClose={() => {
          loadWalletsModal.setState(false);
        }}
      >
        <Modal.Title>Load wallet(s)</Modal.Title>
        <h4 className={styles.ModalSubtitle}>
          Use your{" "}
          <a
            href="https://www.arweave.org/wallet"
            target="_blank"
            rel="noopener noreferrer"
          >
            Arweave keyfile
          </a>{" "}
          or seedphrase to continue.
        </h4>
        <Modal.Content>
          <Textarea
            placeholder="Enter 12 word seedphrase..."
            onChange={(e) => setSeed(e.target.value)}
            className={styles.Seed}
          ></Textarea>
          <span className={styles.OR}>OR</span>
          {keyfiles.map(
            (file, i) =>
              file.filename && (
                <Tooltip
                  text="Click to remove."
                  position="right"
                  key={i}
                  style={{ width: "100%" }}
                >
                  <Card
                    className={styles.FileContent}
                    onClick={() =>
                      setKeyfiles((val) =>
                        val.filter(({ filename }) => filename !== file.filename)
                      )
                    }
                    style={{ display: "flex", alignItems: "center" }}
                  >
                    <div className={styles.items}>
                      <p className={styles.Filename}>{file.filename}</p>
                    </div>
                  </Card>
                </Tooltip>
              )
          )}

          <Card
            className={styles.FileContent}
            onClick={() => fileInput.current?.click()}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "auto"
            }}
          >
            <div className={styles.items}>
              <FileIcon size={24} />
              {keyfiles.length > 0
                ? "Add more keyfile(s)"
                : "Load keyfile(s) from filesystem"}
            </div>
          </Card>
        </Modal.Content>
        <div
          style={{
            display: "flex",
            justifyContent: "space-evenly",
            marginTop: "2em",
            gap: "1em"
          }}
        >
          <Button
            small
            type="secondary"
            onClick={() => {
              loadWalletsModal.setState(false);
            }}
            style={{ width: "30%" }}
          >
            Cancel
          </Button>
          <Button
            small
            type="filled"
            onClick={login}
            loading={loading}
            style={{ width: "30%" }}
          >
            Load
          </Button>
        </div>
      </Modal>
      <Modal {...seedModal.bindings}>
        <Modal.Title>Generated a wallet</Modal.Title>
        <h4 className={styles.ModalSubtitle} style={{ fontWeight: "400" }}>
          Make sure to remember this seedphrase
        </h4>
        <Modal.Content>
          <Textarea
            value={seed}
            readOnly
            className={styles.Seed + " " + styles.NewSeed}
          ></Textarea>
          <p style={{ textAlign: "center" }}>...and download your keyfile.</p>
          <Button
            small
            type="filled"
            onClick={downloadSeedWallet}
            style={{ width: "89%" }}
          >
            Download
          </Button>
        </Modal.Content>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <button
            onClick={() => seedModal.setState(false)}
            className={styles.NewWalletButton}
            style={{ width: "50%" }}
          >
            Dismiss
          </button>
        </div>
      </Modal>
      <Modal {...feeModal.bindings} open={feeModal.bindings.open}>
        <Modal.Title>Tips</Modal.Title>
        <Modal.Content>
          <p style={{ textAlign: "justify" }}>
            We at{" "}
            <a
              href="https://th8ta.org"
              target="_blank"
              rel="noopener noreferrer"
            >
              th8ta
            </a>{" "}
            are working hard to bring you the best experiences on the permaweb.
            Because of this, we take a small tip whenever a 3rd-party
            application utilizes ArConnect. This tip goes to a randomly-selected{" "}
            <Code>VRT</Code> token holder:
          </p>
          <ul>
            <li>
              <Code>$0.03</Code> USD-equivalent of AR for the first 10
              transactions
            </li>
            <li>
              <Code>$0.01</Code> USD-equivalent of AR for all subsequent
              transactions
            </li>
          </ul>
          <p>
            Note: We do <b>not</b> charge fees on transfers made inside of the
            extension and the fee does <b>not</b> change based on the size of
            the transaction.
          </p>
        </Modal.Content>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <button
            onClick={() => feeModal.setState(false)}
            className={styles.NewWalletButton}
            style={{ width: "100%" }}
          >
            Dismiss
          </button>
        </div>
      </Modal>

      {/* <Modal {...loadConfigModal.bindings}>
        <Modal.Title>Load config file</Modal.Title>
        <Modal.Subtitle>
          Import your settings and wallets from a generated config
        </Modal.Subtitle>
        <Modal.Content>
          <Spacer y={0.5} />
          <p style={{ fontWeight: 500, textAlign: "center" }}>
            Important: this is for ArConnect config files,{" "}
            <b>NOT ARWEAVE KEYFILES</b>
          </p>
          <Spacer y={0.5} />
          <Card
            className={styles.FileContent}
            onClick={() => configFileInput.current?.click()}
            style={{ display: "flex", alignItems: "center" }}
          >
            <div className={styles.items}>
              <FileIcon size={24} />
              <p className={styles.Filename}>{configFilenameDisplay}</p>
            </div>
          </Card>
          <Spacer />
          <Input
            {...configPasswordInput.bindings}
            type="password"
            placeholder="Enter your password to decrypt..."
            style={{ width: "100%" }}
          />
        </Modal.Content>
        <Modal.Action onClick={() => loadConfigModal.setVisible(false)} passive>
          Cancel
        </Modal.Action>
        <Modal.Action onClick={loadConfig} loading={loadingConfig}>
          Load
        </Modal.Action>
      </Modal> */}

      <input
        type="file"
        className={styles.FileInput}
        ref={fileInput}
        accept=".json,application/json"
        multiple
      />
      <input type="file" className={styles.FileInput} ref={configFileInput} />
    </>
  );
}
interface SetupConfigProps {
  welcome: boolean;
  password: boolean;
}
