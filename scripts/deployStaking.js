const hre = require("hardhat");

async function main() {

    const Token = await ethers.getContractFactory("StakeToken");
    const token = await Token.deploy();
  
    const Contract = await ethers.getContractFactory("Staking");
    const contract = await Contract.deploy(token.address);
  
    console.log("Staking deployed to:", contract.address);
    console.log("Using stake token with address:", token.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
