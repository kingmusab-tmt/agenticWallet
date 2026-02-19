export type StoredKeypair = {
  name: string;
  publicKey: string;
  cipherText: string;
  iv: string;
  salt: string;
  tag: string;
  createdAt: string;
};
