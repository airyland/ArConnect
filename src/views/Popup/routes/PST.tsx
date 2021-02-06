import React, { useEffect, useState } from "react";
import {
  ArrowLeftIcon,
  ArrowSwitchIcon,
  InfoIcon,
  TrashcanIcon
} from "@primer/octicons-react";
import { goTo } from "react-chrome-extension-router";
import { Asset } from "../../../stores/reducers/assets";
import { Tabs, useTabs, useModal, Modal, Loading } from "@geist-ui/react";
import { useColorScheme } from "use-color-scheme";
import { useDispatch, useSelector } from "react-redux";
import { removeAsset } from "../../../stores/actions";
import { RootState } from "../../../stores/reducers";
import Verto from "@verto/lib";
import Home from "./Home";
import axios from "axios";
import communityxyz_logo from "../../../assets/communityxyz.png";
import verto_logo_light from "../../../assets/verto_light.png";
import verto_logo_dark from "../../../assets/verto_dark.png";
import styles from "../../../styles/views/Popup/PST.module.sass";

export default function PST({ id, name, balance, ticker }: Asset) {
  const [arPrice, setArPrice] = useState(0),
    { scheme } = useColorScheme(),
    tabs = useTabs("1"),
    dispatch = useDispatch(),
    profile = useSelector((state: RootState) => state.profile),
    removeModal = useModal(false),
    [description, setDescription] = useState(""),
    [links, setLinks] = useState<string[]>([]),
    [loading, setLoading] = useState(false);

  useEffect(() => {
    loadArPrice();
    loadData();
    // eslint-disable-next-line
  }, [id]);

  useEffect(() => {
    if (tabs.state === "3")
      window.open(`https://verto.exchange/token?id=${id}`);
  }, [tabs, id]);

  async function loadArPrice() {
    const verto = new Verto();
    setArPrice((await verto.latestPrice(id)) ?? 0);
  }

  async function loadData() {
    setLoading(true);
    try {
      const { data } = await axios.get(
          "https://community.xyz/caching/communities"
        ),
        community = data.find((psc: any) => psc.id === id);

      if (!community) return;
      setDescription(community.state.settings?.communityDescription ?? "");
      setLinks([
        community.state.settings?.communityAppUrl,
        ...community.state.settings?.communityDiscussionLinks
      ]);
    } catch {}
    setLoading(false);
  }

  function removePst() {
    dispatch(removeAsset(profile, id));
    removeModal.setVisible(false);
    goTo(Home);
  }

  return (
    <>
      <div className={styles.Head}>
        <div className={styles.Back} onClick={() => goTo(Home)}>
          <ArrowLeftIcon />
        </div>
        <h1>{name}</h1>
      </div>
      <div className={styles.PST}>
        <button
          onClick={() => removeModal.setVisible(true)}
          className={styles.Remove}
        >
          <TrashcanIcon />
        </button>
        <h1 className={styles.Balance}>
          {balance} <span>{ticker}</span>
        </h1>
        <h2 className={styles.BalanceInAR}>{balance * arPrice} AR</h2>
        <Tabs {...tabs.bindings} className={styles.Tabs}>
          <Tabs.Item
            label={
              <>
                <InfoIcon />
                About
              </>
            }
            value="1"
          >
            <div className={styles.About}>
              {(loading && <Loading />) ||
                ((description || (links && links.length > 0)) && (
                  <>
                    <p>{description}</p>
                    <ul>
                      {links.map((link, i) => (
                        <li key={i}>
                          <a href={link} onClick={() => window.open(link)}>
                            {link
                              .replace(/(https|http):\/\//, "")
                              .replace(/\/$/, "")}
                          </a>
                        </li>
                      ))}
                      <li>
                        <a
                          href={`https://community.xyz/#${id}`}
                          onClick={() =>
                            window.open(`https://community.xyz/#${id}`)
                          }
                        >
                          community.xyz/{name.toLowerCase()}
                        </a>
                      </li>
                    </ul>
                  </>
                )) || (
                  <p style={{ textAlign: "center" }}>No data for this PST.</p>
                )}
            </div>
          </Tabs.Item>
          <Tabs.Item
            label={
              <>
                <ArrowSwitchIcon />
                Transfer
              </>
            }
            value="2"
          ></Tabs.Item>
          <Tabs.Item
            label={
              <>
                <img
                  src={scheme === "dark" ? verto_logo_dark : verto_logo_light}
                  alt="verto"
                  className={styles.TabItemIcon}
                />
                Verto
              </>
            }
            value="3"
          ></Tabs.Item>
        </Tabs>
      </div>
      <Modal {...removeModal.bindings}>
        <Modal.Title>Remove PST?</Modal.Title>
        <Modal.Content>
          <p>Do you want to remove this PST from the displayed PSTs list?</p>
        </Modal.Content>
        <Modal.Action passive onClick={() => removeModal.setVisible(false)}>
          Cancel
        </Modal.Action>
        <Modal.Action onClick={removePst}>Remove</Modal.Action>
      </Modal>
    </>
  );
}
