/**
 * Sepolia -> BSC Testnet token transfer using Wormhole v3 high-level API *
 * - uses ethers v6
 * - uses @wormhole-foundation/sdk v3+
 */

import { ethers } from "ethers";
import dotenv from "dotenv";

// Wormhole SDK v3+:
import { wormhole, amount, TokenId, Wormhole, Signer, chain, ChainContext, ChainAddress } from "@wormhole-foundation/sdk";
import evm from "@wormhole-foundation/sdk/evm";

dotenv.config();

/* ---------- Конфигурация ---------------------------------------------- */
const FROM_CHAIN_NAME = 'Sepolia';     // имя цепи как в Wormhole (см. docs)
const TO_CHAIN_NAME = 'Bsc';    // имя целевой цепи
const AMOUNT_HUMAN = "0.005";          // сколько ETH хотим передать (строка) */

/* ---------- Вспомогательные проверки/env ---------- */
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const SEPOLIA_RPC = process.env.INFURA_API_KEY;
const BSC_TESTNET_RPC = process.env.BSC_TESTNET_RPC;

if (!PRIVATE_KEY || !SEPOLIA_RPC || !BSC_TESTNET_RPC) {
  console.error("❌ Укажите PRIVATE_KEY, SEPOLIA_RPC и BSC_TESTNET_RPC в .env");
  process.exit(1);
}

async function getSignerForChain(rpcUrl: string) {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(PRIVATE_KEY!, provider);
  return { provider, wallet };
}

async function main() {
  console.log("🔁 Запускаем Wormhole token transfer (Sepolia -> BSC Testnet)");

  // 1) Platform loaders: передаём загрузчики платформ (evm для нашего случая)
  //    В v3+ мы передаём именно сам загрузчик (функцию), а не вызываем его.
  const loaders = [evm]; // достаточно evm — поддерживаются все EVM-чейны

  // 2) Создаём контекст Wormhole (Testnet)
  //    wormhole(...) вернёт объект, у которого можно вызывать wh.getChain(...)
  //    Используем any, чтобы TS не ругался на сложные generic-типизации SDK
  const wh: any = await wormhole("Testnet", [evm]);
  console.log("✅ Wormhole context создан");

  // 3) Получаем определения цепей (ChainDefinition-like)
  //    wh.getChain(name) — берёт информацию о цепи по имени
  const sendChain: any = wh.getChain(FROM_CHAIN_NAME);  
  const rcvChain: any = wh.getChain(TO_CHAIN_NAME);
  console.log(`Отправляющая цепь: ${sendChain.chain}, принимающая: ${rcvChain.chain}`);

  // 4) Создаём локальные signers для обеих сетей (ethers)
  const { provider: fromProvider, wallet: fromWallet } = await getSignerForChain(SEPOLIA_RPC!);
  const { provider: toProvider, wallet: toWallet } = await getSignerForChain(BSC_TESTNET_RPC!);

  console.log("From wallet:", await fromWallet.getAddress());
  console.log("To wallet:", await toWallet.getAddress());
  
  //получаем из наших кошельков платформенный signer
  const sendSigner : Signer = await (await evm()).getSigner(await sendChain.getRpc(), PRIVATE_KEY!);
  const rcvSigner : Signer = await (await evm()).getSigner(await rcvChain.getRpc(), PRIVATE_KEY!);  

  //формируем объект-источник и объект-получатель из signer
  const source = {chain: sendChain.chain, signer: sendSigner, 
      address: Wormhole.chainAddress(sendChain.chain, sendSigner.address())}; 
  const dest = {chain: rcvChain.chain, signer: rcvSigner, 
      address: Wormhole.chainAddress(rcvChain.chain, rcvSigner.address())};     

  // 5) Определяем token id — shortcut для нативного токена  
   const token = Wormhole.tokenId(sendChain.chain, 'native');
  
  // 6) Вычисляем сумму (нормализуем в единицы, учитывая decimals)
  //    Для нативных токенов обычно 18 десятичных
  const decimals = 18;
  const amt = amount.units(amount.parse(AMOUNT_HUMAN, decimals));

  // 7) Создаём high-level transfer (в документации — wh.tokenTransfer(...))
  //    Аргументы: token, amount, sourceAddress, destAddress, route (например 'TokenBridge')
  //    Мы используем маршрут 'TokenBridge' (стандартный token bridge)
  //    Получаем объект xfer (TokenTransfer) — далее работаем с ним     
  
  console.log(`Подготовка трансфера: ${AMOUNT_HUMAN} (${amt})`);   
  const xfer: any = await wh.tokenTransfer(
    token,
    amt,    
    source.address,
    dest.address,    
    'TokenBridge' // маршрут (AutomaticTokenBridge не сработал - вылетела ошибка, что в тестовых сетях не поддерживается)
  ); 
 
  console.log("✅ TokenTransfer создан");
 
  // 8) Отправляем транзакции на исходной цепи (инициация)  
  console.log("📤 Инициация трансфера (отправка транзакции на исходную сеть)...");
  const srcTxids = await xfer.initiateTransfer(source.signer);
  console.log("Source txids:", srcTxids);

  // 9) Ждём VAA (attestation)
  // Важно: xfer.fetchAttestation() ждёт подписи от всех guardian'ов
  // на VAA. Этот шаг может занимать значительное время,
  // поэтому он обёрнут в цикл с повторными попытками для устойчивости.
  console.log("⏳ Ожидаем VAA (attestation от guardian'ов) — может занять время...");

  let vaaFetched = false;
  const maxAttempts = 1800; // на практике забирает около 500-600 попыток
  const retryDelay = 2000; // 2 сек

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      await xfer.fetchAttestation(5000); // короткий таймаут
      vaaFetched = true;
      console.log("✅ VAA получен!");
      break;
    } catch (err: any) {
      if (err.message.includes("VAA not found") || err.code === "ECONNRESET") {
        console.log(`Попытка ${attempt + 1}/${maxAttempts}: VAA пока нет, повторяем через ${retryDelay / 1000} сек...`);
        await new Promise(res => setTimeout(res, retryDelay));
      } else {
        throw err; // если ошибка другая — кидаем
      }
    }
  }
  // 10) Выполняем complete/redeem на целевой цепи  
  if (vaaFetched) {
    console.log("📥 Выполнение completeTransfer (redeem) на целевой цепи...");
    const destTxids = await xfer.completeTransfer(rcvSigner);
    console.log("Dest txids:", destTxids);
    console.log("🎉 Трансфер завершён. Проверьте баланс на целевой сети.");
  } else {
    console.warn("❌ VAA не получен за отведённое время. completeTransfer не выполнен.");
  }    
  
}

main().catch((err) => {
  console.error("Ошибка в сценарии:", err);
  process.exit(1);
});
