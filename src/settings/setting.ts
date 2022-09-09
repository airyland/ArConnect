import { Storage } from "@plasmohq/storage";
import { PREFIX } from "~settings";
import { getStorageConfig } from "~utils/storage";

export default class Setting {
  /** Name of the setting */
  public name: string;

  /** Display name of the setting */
  public displayName: string;

  /** Setting description */
  public description?: string;

  /** Type of the setting */
  public type: SettingType;

  /** Default value of the setting */
  public defaultValue: ValueType;

  /** Pickable options */
  public options?: ValueType[];

  /** Name in extension storage */
  public storageName: string;

  /** Storage to fetch from */
  #storage: Storage;

  constructor({
    name,
    displayName,
    description,
    type,
    defaultValue,
    options
  }: InitParams) {
    this.name = name;
    this.displayName = displayName;
    this.description = description;
    this.type = type;
    this.defaultValue = defaultValue;

    // set storage name
    this.storageName = `${PREFIX}${name}`;

    // init storage
    this.#storage = new Storage(getStorageConfig());

    // add options
    if (type === "pick") {
      if (!options) throw new Error("Options not defined");

      this.options = options;
    }
  }

  /**
   * Get the current value of the setting
   */
  public async getValue(): Promise<ValueType> {
    const value = await this.#storage.get(this.storageName);

    if (typeof value === "string" && value.startsWith("boolean_")) {
      return value.replace("boolean_", "") === "true";
    }

    return value || this.defaultValue;
  }

  /**
   * Set the value of the setting
   */
  public async setValue(value: ValueType) {
    // ensure the picked option is from the
    // defined options
    if (this.type === "pick" && !this.options.includes(value)) {
      throw new Error("Selected option is not included in the defined options");
    }
    // ensure the submitted value's type is correct
    else if (this.type !== "pick" && typeof value !== this.type) {
      throw new Error("Invalid value submitted");
    }

    if (typeof value === "boolean") {
      value = `boolean_${value}`;
    }

    // update value
    await this.#storage.set(this.storageName, value);
  }
}

/**
 * string / number / boolean
 * pick - Pick from a list
 */
type SettingType = "string" | "number" | "boolean" | "pick";
export type ValueType = string | number | boolean;

interface InitParams {
  name: string;
  displayName: string;
  description?: string;
  type: SettingType;
  defaultValue: ValueType;
  options?: ValueType[];
}