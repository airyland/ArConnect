import React, { PropsWithChildren, useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "../../../stores/reducers";
import { ArchiveIcon, CopyIcon, DownloadIcon } from "@primer/octicons-react";
import { Tooltip, Spacer, Loading, useToasts } from "@verto/ui";
import { setBalance } from "../../../stores/actions";
import { goTo } from "react-chrome-extension-router";
import { useColorScheme } from "use-color-scheme";
import { arToFiat, getSymbol } from "../../../utils/currency";
import { validateMessage } from "../../../utils/messenger";
import { browser } from "webextension-polyfill-ts";
import { getActiveTab } from "../../../utils/background";
import { concatGatewayURL } from "../../../utils/gateways";
import { shortenURL } from "../../../utils/url";
import { motion, AnimatePresence } from "framer-motion";
import { cardListAnimation } from "verto-internals/utils/index";
import { fetchBalancesForAddress, UserBalance } from "verto-cache-interface";
import { QRCode } from "react-qr-svg";
import mime from "mime-types";
import axios from "axios";
import WalletManager from "../../../components/WalletManager";
import Send from "./Send";
import Settings from "./Settings";
import Explore from "./Explore";
import Verto from "@verto/lib";
import Arweave from "arweave";
import copy from "copy-to-clipboard";
import QRIcon from "../../../assets/QR.svg";
import GlobeIcon from "../../../assets/globe.svg";
import AssetCard from "../../../components/AssetCard";
import TransactionCard from "../../../components/TransactionCard";
import { CollectibleCard } from "../../../components/CollectibleCard";
import styles from "../../../styles/views/Popup/home.module.sass";

export default function Home() {
  const arweaveConfig = useSelector((state: RootState) => state.arweave),
    storedBalances = useSelector((state: RootState) => state.balances),
    arweave = new Arweave(arweaveConfig),
    profile = useSelector((state: RootState) => state.profile),
    dispatch = useDispatch(),
    { scheme } = useColorScheme(),
    { currency } = useSelector((state: RootState) => state.settings),
    [currentTabContentType, setCurrentTabContentType] = useState<
      "page" | "pdf" | undefined
    >("page"),
    [showQRCode, setShowQRCode] = useState(false),
    [loading, setLoading] = useState({ psts: true, txs: true }),
    [transactions, setTransactions] = useState<
      {
        id: string;
        amount: number;
        type: string;
        status: string;
        timestamp: number;
      }[]
    >([]),
    { setToast } = useToasts();

  useEffect(() => {
    loadBalance();
    loadContentType();
    loadTransactions();
    // eslint-disable-next-line
  }, [currency, profile]);

  useEffect(() => {
    loadBalance();
    // eslint-disable-next-line
  }, [currency, profile]);

  async function loadBalance() {
    let arBalance = balance()?.arBalance ?? 0,
      fiatBalance = balance()?.fiatBalance ?? 0;

    try {
      const fetchedBalance = parseFloat(
        arweave.ar.winstonToAr(await arweave.wallets.getBalance(profile))
      );

      if (!isNaN(fetchedBalance)) arBalance = fetchedBalance;
    } catch {}

    try {
      const fetchedBalance = parseFloat(
        (await arToFiat(arBalance, currency)).toFixed(2)
      );

      if (!isNaN(fetchedBalance)) fiatBalance = fetchedBalance;
    } catch {}

    dispatch(setBalance({ address: profile, arBalance, fiatBalance }));
  }

  async function loadTransactions() {
    const verto = new Verto();
    setLoading((val) => ({ ...val, txs: true }));

    try {
      setTransactions(await verto.getTransactions(profile));
    } catch {}
    setLoading((val) => ({ ...val, txs: false }));
  }

  function balance() {
    return storedBalances.find((balance) => balance.address === profile);
  }

  async function loadContentType() {
    const currentTab = await getActiveTab();

    if (
      !currentTab.url ||
      (new URL(currentTab.url).protocol !== "http:" &&
        new URL(currentTab.url).protocol !== "https:")
    )
      return setCurrentTabContentType(undefined);

    try {
      const data = await axios.get(currentTab.url);
      if (
        mime
          .extension(data.headers["content-type"])
          .toString()
          .toLowerCase() === "pdf"
      )
        setCurrentTabContentType("pdf");
      else setCurrentTabContentType("page");
    } catch {
      setCurrentTabContentType(undefined);
    }
  }

  const [isFirefox, setIsFirefox] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const browserInfo = await browser.runtime.getBrowserInfo();

        setIsFirefox(browserInfo.name === "Firefox");
      } catch {
        setIsFirefox(false);
      }
    })();
  }, []);

  async function archive() {
    if (isFirefox) return;

    try {
      const currentTab = await getActiveTab();

      if (!currentTabContentType || !currentTab.url) return;
      if (currentTabContentType === "page") {
        const res = await browser.runtime.sendMessage({
          type: "archive_page",
          ext: "arconnect",
          sender: "popup"
        });

        if (
          !validateMessage(res, {
            sender: "content",
            type: "archive_page_content"
          })
        )
          return;

        await browser.storage.local.set({
          lastArchive: {
            url: res.url,
            content: res.data,
            type: "page"
          }
        });
      } else {
        await browser.storage.local.set({
          lastArchive: {
            url: currentTab.url,
            content: "",
            type: "pdf"
          }
        });
      }

      browser.tabs.create({ url: browser.runtime.getURL("/archive.html") });
    } catch (error) {
      console.log(error);
    }
  }

  /**
   * TODO: only load 5-6 of the assets and the collectibles in detail (price & additional loadings),
   * but display the total amount of these that the user owns
   */
  const [assets, setAssets] = useState<(UserBalance & { arPrice: number })[]>();

  // load asset balances (first from cache) for the active address
  useEffect(() => {
    const CACHE_NAME = "assets_cache";
    const val = localStorage.getItem(CACHE_NAME);

    if (val) setAssets(JSON.parse(val));

    (async () => {
      // TODO: asset total balance in current currency
      const res = (await fetchBalancesForAddress(profile, "community")).map(
        (val) => ({ ...val, arPrice: 1000 })
      );

      setAssets(res);
      localStorage.setItem(CACHE_NAME, JSON.stringify(res));
    })();
  }, [profile]);

  const [collectibles, setCollectibles] = useState<UserBalance[]>();

  // load collectibles (first from cache) for the active address
  useEffect(() => {
    const CACHE_NAME = "collectibles_cache";
    const val = localStorage.getItem(CACHE_NAME);

    if (val) setCollectibles(JSON.parse(val));

    (async () => {
      const res = await fetchBalancesForAddress(profile, "art");

      setCollectibles(res);
      localStorage.setItem(CACHE_NAME, JSON.stringify(res));
    })();
  }, [profile]);

  // gateway status
  const [gatewayStatus, setGatewayStatus] = useState<"online" | "offline">(
    "online"
  );

  useEffect(() => {
    (async () => {
      try {
        const { status } = await axios.get(
          `${arweaveConfig.protocol}://${arweaveConfig.host}:${arweaveConfig.port}`,
          { timeout: 10000 }
        );

        if (status !== 200) throw new Error();
        setGatewayStatus("online");
      } catch {
        setGatewayStatus("offline");
      }
    })();
  }, [arweaveConfig]);

  return (
    <div className={styles.Home}>
      <WalletManager />
      <div className={styles.Balance}>
        <Tooltip text={`Gateway is ${gatewayStatus}`}>
          <div
            className={
              styles.Gateway + " " + styles[`GatewayStatus_${gatewayStatus}`]
            }
            onClick={() => goTo(Settings, { initialSetting: "gateway" })}
          >
            <span className={styles.GatewayStatusIndicator} />
            {arweaveConfig.host.replace("www.", "")}
          </div>
        </Tooltip>
        <p className={styles.Address}>
          <button onClick={() => setShowQRCode(true)}>
            <QRIcon />
          </button>
          <button
            style={{ marginRight: ".5em", marginLeft: ".5em" }}
            onClick={() => {
              copy(profile);
              setToast({
                description: "Copied address to clipboard",
                type: "success",
                duration: 2000
              });
            }}
          >
            <CopyIcon />
          </button>
          {shortenURL(profile)}
        </p>
        <div className={styles.ArBalance}>
          <h1>
            {balance()?.arBalance?.toLocaleString(undefined, {
              maximumFractionDigits: 5
            })}{" "}
            AR{" "}
          </h1>
        </div>
        <h2>
          {getSymbol(currency)}
          {balance()?.fiatBalance.toLocaleString(undefined, {
            maximumFractionDigits: 2,
            minimumFractionDigits: 2
          })}{" "}
          {currency ?? "???"}
        </h2>
        <div className={styles.Menu}>
          <div
            className={styles.Item + " " + styles.SendItem}
            onClick={() => goTo(Send)}
          >
            <DownloadIcon size={24} />
            <span>Send</span>
          </div>
          <div
            onClick={() => goTo(Explore)}
            className={styles.Item + " " + styles.SwapItem}
          >
            <GlobeIcon />
            <span>Explore</span>
          </div>
          <ArchiveWrapper
            supported={currentTabContentType !== undefined}
            firefox={isFirefox}
          >
            <div
              className={
                styles.Item +
                " " +
                (!currentTabContentType || isFirefox ? styles.Unavailable : "")
              }
              onClick={archive}
            >
              <ArchiveIcon size={24} />
              <span>Archive</span>
            </div>
          </ArchiveWrapper>
        </div>
      </div>

      <div className={styles.Section}>
        <div className={styles.Title}>
          <h1>Assets</h1>
          <h1
            className={styles.Link}
            onClick={() =>
              browser.tabs.create({
                url: `https://viewblock.io/arweave/address/${profile}?tab=tokens`
              })
            }
          >
            View all
            <span>{assets?.length || "0"}</span>
          </h1>
        </div>
        <div className={styles.Items}>
          <AnimatePresence>
            {(assets &&
              ((assets.length &&
                assets
                  .sort((a, b) => b.balance - a.balance)
                  .map((asset, i) => (
                    <motion.div
                      className={styles.SectionItem}
                      {...cardListAnimation(i)}
                      key={i}
                    >
                      <AssetCard
                        id={asset.contractId}
                        ticker={asset.ticker || ""}
                        display={asset.balance}
                      />
                    </motion.div>
                  ))) ||
                "No assets so far")) || (
              <Loading.Spinner style={{ margin: "0 auto" }} />
            )}
          </AnimatePresence>
        </div>
      </div>

      <Spacer y={0.95} />

      <div className={styles.Section}>
        <div className={styles.Title}>
          <h1>Collectibles</h1>
          <h1
            className={styles.Link}
            onClick={() =>
              browser.tabs.create({
                url: `https://www.verto.exchange/@${profile}/owns`
              })
            }
          >
            View all
            <span>{collectibles?.length || "0"}</span>
          </h1>
        </div>
        <div className={styles.Items}>
          <AnimatePresence>
            {(collectibles &&
              ((collectibles.length &&
                collectibles
                  .sort((a, b) => b.balance - a.balance)
                  .map((collectible, i) => (
                    <motion.div
                      className={styles.SectionItem}
                      {...cardListAnimation(i)}
                      key={i}
                    >
                      <CollectibleCard
                        id={collectible.contractId}
                        image={`https://arweave.net/${collectible.contractId}`}
                        name={collectible.name || ""}
                        ticker={collectible.ticker || ""}
                        balance={collectible.balance}
                      />
                    </motion.div>
                  ))) ||
                "No collectibles so far")) || (
              <Loading.Spinner style={{ margin: "0 auto" }} />
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className={styles.Section}>
        <div className={styles.Title}>
          <h1>Transactions</h1>
          <h1
            className={styles.Link}
            onClick={() =>
              browser.tabs.create({
                url: `https://viewblock.io/arweave/address/${profile}`
              })
            }
          >
            View all
          </h1>
        </div>
        <Spacer y={1} />
        <AnimatePresence>
          {(transactions.length > 0 &&
            transactions.slice(0, 12).map((tx, i) => (
              <motion.div
                className={styles.SectionItem}
                {...cardListAnimation(i)}
                key={i}
              >
                <TransactionCard
                  type={tx.type}
                  status={tx.status}
                  amount={tx.amount}
                  txID={tx.id}
                  key={i}
                />
                <Spacer y={0.55} />
              </motion.div>
            ))) ||
            (loading.txs && (
              <div className={styles.TransactionSpinner}>
                <Loading.Spinner />
              </div>
            )) || <p className={styles.EmptyIndicatorText}>No transactions</p>}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {showQRCode && (
          <motion.div
            className={styles.QROverlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.23, ease: "easeInOut" }}
            onClick={() => setShowQRCode(false)}
          >
            <div className={styles.Wrapper}>
              <QRCode
                className={styles.QRCode}
                value={profile}
                bgColor={scheme === "dark" ? "#000000" : "#ffffff"}
                fgColor={scheme === "dark" ? "#ffffff" : "#000000"}
              />
              <p>{profile}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ArchiveWrapper({
  children,
  supported,
  firefox
}: PropsWithChildren<{ supported: boolean; firefox: boolean }>) {
  return (
    (supported && !firefox && <>{children}</>) || (
      <Tooltip
        text={
          <p style={{ margin: 0 }}>
            {(firefox && "Unsupported browser") || "Content-type unsupported"}
          </p>
        }
      >
        {children}
      </Tooltip>
    )
  );
}
