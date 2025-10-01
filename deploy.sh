#!/bin/bash
# скрипт для деплоя контракта в разные сети
set -euo pipefail

# === Загружаем переменные окружения из .env ===
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
else
  echo "❌ Файл .env не найден!"
  exit 1
fi

CONTRACT="Auction"
CONTRACT_PATH="contracts/Auction.sol"

NETWORK=${1:-sepolia}
# выбираем сеть по переданному параметру
case "$NETWORK" in
  sepolia)
    RPC_URL=$SEPOLIA_API_URL
    CHAIN_ID=11155111    
    ;;
  bsc-testnet)
    RPC_URL=$BSC_TESTNET_RPC
    CHAIN_ID=97    
    ;;
  opbnb-testnet)
    RPC_URL=$OPBNB_TESTNET_RPC
    CHAIN_ID=5611    
    ;;
  polygonAmoy)
    RPC_URL=$AMOY_RPC
    CHAIN_ID=80002    
    ;;
  *)
    echo "❌ Неизвестная сеть: $NETWORK"
    exit 1
    ;;
esac

echo "🚀 Деплой контракта $CONTRACT в сеть $NETWORK ..."

# --- Деплой и получение адреса ---
CONTRACT_ADDRESS=$(forge create "$CONTRACT_PATH:$CONTRACT" \
  --rpc-url "$RPC_URL" \
  --private-key "$PRIVATE_KEY" \
  --chain-id "$CHAIN_ID" \
  --broadcast \
  | grep "Deployed to:" | awk '{print $3}')

# --- Ждём 15 секунд ---
sleep 15

echo "✅ Контракт задеплоен: $CONTRACT_ADDRESS"

# --- Верификация через Etherscan/Polygonscan ---
echo "🔍 Пытаемся верифицировать контракт..."

GUID=$(forge verify-contract \
  --chain-id "$CHAIN_ID" \
  --etherscan-api-key "$ETHERSCAN_API_KEY" \
  "$CONTRACT_ADDRESS" \
  "$CONTRACT_PATH:$CONTRACT" \
  --compiler-version "v0.8.30+commit.73712a01" \
  2>&1 | grep "GUID" | awk '{print $2}' || true)

if [ -n "$GUID" ]; then
  echo "📝 Отправлено на верификацию. GUID: $GUID"
  echo "⏳ Проверяем статус..."

  while true; do
    STATUS=$(forge verify-check \
      --chain-id "$CHAIN_ID" \
      --etherscan-api-key "$ETHERSCAN_API_KEY" \
      "$GUID" 2>&1)

    echo "$STATUS"

    if echo "$STATUS" | grep -iq "verified"; then
        echo "✅ Контракт успешно верифицирован!"
    break
    elif echo "$STATUS" | grep -iq "fail"; then
        echo "❌ Верификация не удалась."
        break
    else
        sleep 5
    fi

  done
else
  echo "⚠️ Не удалось отправить на верификацию."
fi
