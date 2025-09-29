import fs from "fs";
import dotenv from "dotenv";
import hre, { ethers } from "hardhat";
import axios from "axios";

dotenv.config();

const BASE_URL = "https://api.etherscan.io/v2/api"; // единая точка входа для V2
const CONTRACT_NAME = process.env.CONTRACT || "Auction";
const CHAIN_ID = process.env.CHAIN_ID || "97"; // BSC testnet по умолчанию
const CONTRACT_FILE = `./contracts/${CONTRACT_NAME}.sol`;

async function main() {
  // 1. Деплой
  console.log("DEPLOYING...");
  const [deployer] = await ethers.getSigners();

  const factory = await ethers.getContractFactory(CONTRACT_NAME);
  const contract = await factory.deploy();
  await contract.waitForDeployment();

  const contractAddress = await contract.getAddress();
  console.log(`Deployed ${CONTRACT_NAME} at: ${contractAddress}`);

  const tx = contract.deploymentTransaction();
  if (tx) await tx.wait(5); // ждём 5 подтверждений
  console.log("✅ Deployment confirmed");

  // 2. Читаем исходник
  const sourceCode = fs.readFileSync(CONTRACT_FILE, "utf8");

  // 3. Верификация через Etherscan/BscScan V2
  try {
    console.log("VERIFYING...");

    const res = await axios.post(
      `${BASE_URL}?chainId=${CHAIN_ID}`,
      new URLSearchParams({
        module: "contract",
        action: "verifysourcecode",
        apikey: process.env.ETHERSCAN_API_KEY || "",
        contractaddress: contractAddress,
        sourceCode,
        codeformat: "solidity-single-file",
        contractname: CONTRACT_NAME,
        compilerversion: "v0.8.30+commit.73712a01",
        optimizationUsed: "1",
        runs: "200",
        constructorArguments: "", // если нет аргументов
      }).toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    console.log("Initial response:", res.data);

    if (res.data.status !== "1") {
      console.error("❌ Verification submission failed:", res.data);
      return;
    }

    const guid = res.data.result;
    console.log("GUID:", guid);

    // 4. Проверяем статус верификации
    let status = "0";
    while (status === "0") {
      await new Promise((r) => setTimeout(r, 5000));

      const check = await axios.get(`${BASE_URL}?chainId=${CHAIN_ID}`, {
        params: {
          module: "contract",
          action: "checkverifystatus",
          guid,
          apikey: process.env.ETHERSCAN_API_KEY || "",
        },
      });

      console.log("Check:", check.data);
      status = check.data.status;

      if (status === "1") {
        console.log("✅ Verification success!");
        return;
      }
      if (status === "0" && check.data.result !== "Pending in queue") {
        console.error("❌ Verification failed:", check.data.result);
        return;
      }
    }
  } catch (err: unknown) {
    const e = err as any;
    console.error("Verification error:", e.response?.data || e.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
