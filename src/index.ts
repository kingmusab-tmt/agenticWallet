import { WalletService } from "./wallet/WalletService.js";

const walletService = new WalletService();
const connection = walletService.getConnection();

(async () => {
  const version = await connection.getVersion();
  console.log(
    JSON.stringify({ rpc: connection.rpcEndpoint, version }, null, 2),
  );
})().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
