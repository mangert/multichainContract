// scripts/verify.ts
import axios from "axios";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

const CHAIN_ID = process.argv[2] || "11155111"; // передается аргументом, по умолчанию сеполия
const CONTRACT_PATH = "contracts/Auction.sol";
const CONTRACT_FILE_NAME = "contracts/Auction.sol"; // точно так же укажем в sources
const CONTRACT_FULLNAME = `${CONTRACT_FILE_NAME}:Auction`; // contractname для API

const BASE_URL = `https://api.etherscan.io/v2/api?chainId=${CHAIN_ID}`; // Etherscan V2 unified endpoint

async function verify() {
  try {
    const source = fs.readFileSync(CONTRACT_PATH, "utf8");

    // --- Собираем standard-json-input ---
    const input = {
      language: "Solidity",
      sources: {
        [CONTRACT_FILE_NAME]: {
          content: source,
        },
      },
      settings: {
        optimizer: {
          enabled: true,    // так деплоили
          runs: 200,        // так деплоили
        },
        outputSelection: {
          "*": {
            "*": ["abi", "evm.bytecode", "evm.deployedBytecode", "metadata"],
          },
        },
      },
    };

    // Формируем тело (sourceCode — это stringified JSON)
    const params = new URLSearchParams({
      module: "contract",
      action: "verifysourcecode",
      apikey: process.env.ETHERSCAN_API_KEY || "",
      contractaddress: "0xFAAA1b54B96Ca6F00cE44Fc54828F57d1362AbA4", //подставить актуальный
      sourceCode: JSON.stringify(input),
      codeformat: "solidity-standard-json-input",
      contractname: CONTRACT_FULLNAME,
      compilerversion: "v0.8.30+commit.73712a01", // проверила 
      optimizationUsed: "1",
      runs: "200",
      constructorArguments: "", // у нас нет аргументов
    });

    console.log("Submitting verification request...");
    const res = await axios.post(BASE_URL, params.toString(), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    console.log("Initial response:", res.data);

    if (res.data.status !== "1") {
      console.error("❌ Verification submission failed:", res.data);
      return;
    }

    const guid = res.data.result;
    console.log("GUID:", guid);

    // Poll checkverifystatus
    let status = "0";
    while (status === "0") {
      await new Promise((r) => setTimeout(r, 5000));
      const check = await axios.get(BASE_URL, {
        params: {
          module: "contract",
          action: "checkverifystatus",
          guid,
          apikey: process.env.ETHERSCAN_API_KEY || "",
        },
        // avoid small timeouts, allow big responses
        timeout: 30000,
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
  } catch (e: any) {
    console.error("Error:", e.response?.data || e.message || e);
  }
}

verify();
