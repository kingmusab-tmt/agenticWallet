import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { Keypair } from "@solana/web3.js";
import { KEYSTORE_PASSPHRASE } from "../config.js";
import { StoredKeypair } from "./types.js";

const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const SALT_LENGTH = 16;

export class KeyManager {
  constructor(private readonly passphrase: string = KEYSTORE_PASSPHRASE) {
    if (!passphrase) {
      throw new Error("KEYSTORE_PASSPHRASE is required.");
    }
  }

  private deriveKey(salt: Buffer): Buffer {
    return scryptSync(this.passphrase, salt, KEY_LENGTH);
  }

  encryptKeypair(name: string, keypair: Keypair): StoredKeypair {
    const iv = randomBytes(IV_LENGTH);
    const salt = randomBytes(SALT_LENGTH);
    const key = this.deriveKey(salt);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const cipherText = Buffer.concat([
      cipher.update(Buffer.from(keypair.secretKey)),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    return {
      name,
      publicKey: keypair.publicKey.toBase58(),
      cipherText: cipherText.toString("base64"),
      iv: iv.toString("base64"),
      salt: salt.toString("base64"),
      tag: tag.toString("base64"),
      createdAt: new Date().toISOString(),
    };
  }

  decryptKeypair(stored: StoredKeypair): Keypair {
    const iv = Buffer.from(stored.iv, "base64");
    const salt = Buffer.from(stored.salt, "base64");
    const tag = Buffer.from(stored.tag, "base64");
    const key = this.deriveKey(salt);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const secretKey = Buffer.concat([
      decipher.update(Buffer.from(stored.cipherText, "base64")),
      decipher.final(),
    ]);
    return Keypair.fromSecretKey(new Uint8Array(secretKey));
  }

  async saveKeypair(
    dir: string,
    name: string,
    keypair: Keypair,
  ): Promise<StoredKeypair> {
    const stored = this.encryptKeypair(name, keypair);
    await fs.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, `${name}.json`);
    await fs.writeFile(filePath, JSON.stringify(stored, null, 2), "utf8");
    return stored;
  }

  async loadKeypair(dir: string, name: string): Promise<Keypair> {
    const filePath = path.join(dir, `${name}.json`);
    const raw = await fs.readFile(filePath, "utf8");
    const stored = JSON.parse(raw) as StoredKeypair;
    return this.decryptKeypair(stored);
  }

  async listKeypairs(dir: string): Promise<string[]> {
    try {
      const entries = await fs.readdir(dir);
      return entries
        .filter((entry) => entry.endsWith(".json"))
        .map((entry) => entry.replace(/\.json$/, ""));
    } catch {
      return [];
    }
  }
}
