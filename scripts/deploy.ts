import fs from "fs";
import path from "path";
import hre, { ethers, run } from "hardhat";
//скрипт для деплоя
async function main() {
    
    const contractName = process.env.CONTRACT || "Auction";
    
    //деплой
    console.log("DEPLOYING...");
    const [deployer, owner] = await ethers.getSigners();

    const auction_Factory = await ethers.getContractFactory(contractName);
    const auction = await auction_Factory.deploy();    
    await auction.waitForDeployment(); 

    const contractAddress = await auction.getAddress();
    console.log("Deployed auction at:", contractAddress);
    
    //ждем подтверждений
    const tx = auction.deploymentTransaction();
    if (tx) {
        await tx.wait(5); // ← ждем 5 подтверждений
    }    

    console.log("Confirmed");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error); 
        process.exit(1);
    });
