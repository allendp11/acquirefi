// Import the required libraries
const {
    time,
    loadFixture,
  } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

// Test the StakeToken contract
describe("StakeToken", function () {

    // Declare global variables
    let owner;
    let user1;
    let user2;
    let token;
    let stakeToken;
    let twoWeeksApy;
    let oneMonthApy;
    let threeMonthApy;
    let sixMonthApy;
    let oneYearApy;
    let rewardsWallet;
    let exitPenaltyFee;

    // Deploy the contracts before each test
    beforeEach(async function () {
        [owner, user1, user2] = await ethers.getSigners();

        // Deploy the ERC20 token
        const Token = await ethers.getContractFactory("StakeToken");
        token = await Token.deploy();

        // Deploy the StakeToken contract
        const StakeToken = await ethers.getContractFactory("Staking");
        stakeToken = await StakeToken.deploy(token.address);

        // Initialize the staking contract
        twoWeeksApy = 5;
        oneMonthApy = 10;
        threeMonthApy = 20;
        sixMonthApy = 30;
        oneYearApy = 40;
        rewardsWallet = owner.address;
        exitPenaltyFee = 5;
        await stakeToken.initializeStaking(twoWeeksApy, oneMonthApy, threeMonthApy, sixMonthApy, oneYearApy, rewardsWallet, exitPenaltyFee);

        // Fund the user accounts with tokens
        const amount = ethers.utils.parseEther("1000");
        await token.transfer(user1.address, amount);
        await token.transfer(user2.address, amount);
        await token.transfer(owner.address, amount);
        await token.connect(owner).approve(stakeToken.address, amount);
    });

    // Test the stake function
    describe("stake", function () {
        it("should allow a user to stake their tokens", async function () {
            // Stake 100 tokens for 30 days
            const amount = ethers.utils.parseEther("100");
            const numDays = 30;
            await token.connect(user1).approve(stakeToken.address, amount);
            await stakeToken.connect(user1).stake(amount, numDays);

            const stakeIds = await stakeToken.getStakeIdsForAddress(user1.address);
            // Check that the stake was successful
            const stakeId = stakeIds[0];
            const stake = await stakeToken.getStakeById(stakeId);

            expect(stakeIds.length).to.equal(1);
            expect(stake.owner).to.equal(user1.address);
            expect(stake.amount).to.equal(amount);
            expect(stake.createdDate).to.not.equal(0);
            expect(stake.unlockDate).to.not.equal(0);
            expect(stake.dailyReward).to.not.equal(0);
            expect(stake.daysToReward).to.equal(numDays);
            expect(stake.lastRewardTimestamp).to.equal(stake.createdDate);
            expect(stake.open).to.equal(true);
            expect(await stakeToken.currentlyStaked()).to.equal(amount);
            expect(await stakeToken.totalStakes()).to.equal(1);

            // Check that the user's token balance has been reduced
            const balance = await token.balanceOf(user1.address);
            expect(balance).to.equal(ethers.utils.parseEther("900"));
        });

        it("should not allow a user to stake zero tokens", async function () {
            // Try to stake 0 tokens
            const amount = ethers.utils.parseEther("0");
            const numDays = 30;
            await token.connect(user1).approve(stakeToken.address, amount);
            await expect(stakeToken.connect(user1).stake(amount, numDays)).to.be.revertedWith("Staking must be greater then zero");

            // Check that the user's token balance has not changed
            const balance = await token.balanceOf(user1.address);
            expect(balance).to.equal(ethers.utils.parseEther("1000"));
        });

        it("should allow a user to stake valid tokens for a specified period", async function () {
            // Stake valid tokens for 30 days
            const amount = ethers.utils.parseEther("100");
            const numDays = 30;
            const DURATION_IN_SECS = numDays * 24 * 60 * 60;

            await token.connect(user1).approve(stakeToken.address, amount);
            // await expect(stakeToken.connect(user1).stake(amount, numDays)).to.emit(stakeToken, 'Staked').withArgs(user1.address, stakeId, amount, expectedUnlockDate);
            await stakeToken.connect(user1).stake(amount, numDays);

            const stakeIds = await stakeToken.getStakeIdsForAddress(user1.address);
            const stakeId = stakeIds[0];
            const stake = await stakeToken.getStakeById(stakeId);
            // Check that the user's token balance has decreased
            const balance = await token.balanceOf(user1.address);
            expect(balance).to.equal(ethers.utils.parseEther("900"));
            // Check that the user's staked token balance has increased
            expect(stake.amount).to.equal(amount);
            // Check that the user's staked token unlock date is correct
            const expectedUnlockDate = (await time.latest()) + DURATION_IN_SECS;
            expect(expectedUnlockDate).to.equal(expectedUnlockDate);
        });
    });

    // Test the unstaking process
    describe("unstake", function () {
        it("should not allow a user to unstake if they have no tokens staked", async function () {
            // Try to unstake with 0 staked tokens
            const stakeId = 1;
            await expect(stakeToken.connect(user1).unstake(stakeId)).to.be.revertedWith("Stake id does not exist");
        });

        it("should not allow a user to unstake before their stake period is over", async function () {
            // Stake some tokens for 30 days
            const amount = ethers.utils.parseEther("500");
            const numDays = 30;
            await token.connect(user1).approve(stakeToken.address, amount);
            await stakeToken.connect(user1).stake(amount, numDays);

            // Try to unstake before the stake period is over
            const stakeId = 1;
            await expect(stakeToken.connect(user1).unstake(stakeId)).to.be.revertedWith("Cannot unstake before maturity");
        });

        it("should allow a user to unstake after their stake period is over", async function () {
            // Stake some tokens for 30 days
            const amount = ethers.utils.parseEther("500");
            const numDays = 30;
           

            await token.connect(user1).approve(stakeToken.address, amount);
            await stakeToken.connect(user1).stake(amount, numDays);

            const stakeIds = await stakeToken.getStakeIdsForAddress(user1.address);
            const stakeId = stakeIds[0];

            // Advance the block timestamp by 31 days
            await ethers.provider.send("evm_increaseTime", [60 * 60 * 24 * 31]);

            // Unstake the tokens
            await expect(stakeToken.connect(user1).unstake(stakeId)).to.emit(stakeToken, 'Unstaked').withArgs(user1.address, stakeId, amount);

            // Check that the user's staked token balance has decreased
            const stake = await stakeToken.getStakeById(stakeId);

            expect(stakeIds.length).to.equal(1);
            expect(stake.daysToReward).to.equal(0);
            expect(stake.open).to.be.false;
            expect(await stakeToken.currentlyStaked()).to.equal("0");

        });


        it("Should emergency unstake correctly", async function () {
            const amount = ethers.utils.parseEther("500");
            const numDays = 30;
            
            await token.connect(user1).approve(stakeToken.address, amount);
            await stakeToken.connect(user1).stake(amount, numDays);

            const stakeIds = await stakeToken.getStakeIdsForAddress(user1.address);
            const stakeId = stakeIds[0];

            await stakeToken.connect(user1).emergencyUnstake(stakeId);

            const stake = await stakeToken.getStakeById(stakeId);


            expect(stakeIds.length).to.equal(1);
            expect(stake.open).to.be.false;
            expect(stake.daysToReward).to.equal(0);
            expect(await stakeToken.currentlyStaked()).to.equal("0");


            //rewards from emergency unstake on staking contract
            const fee = (amount * exitPenaltyFee / 100);
            const balance = await token.balanceOf(stakeToken.address);
            expect(balance).to.equal(fee.toString());

            //user balance minus exit penalty fee
            const balanceuser = await token.balanceOf(user1.address);
            expect(balanceuser).to.equal((+amount + (amount - fee)).toString());
          }); 
    });

    describe("rewards", function() {
        it("Should calculate daily rewards correctly", async function () {
            const amount = ethers.utils.parseEther("100");
            const numDays = 30;
            await token.connect(user1).approve(stakeToken.address, amount);
            await stakeToken.connect(user1).stake(amount, numDays);

            // Check that the stake was successful
            const stakeId = 1;
            const stake = await stakeToken.getStakeById(stakeId);
            let rewards =  ethers.utils.formatEther(stake.dailyReward);
            expect(parseFloat(rewards).toFixed(2)).to.equal("0.33");
        });

        it("Should claim rewards correctly", async function () {
            const amount = ethers.utils.parseEther("100");
            const numDays = 30;
            const stakeId = 1;

            await token.connect(user1).approve(stakeToken.address, amount);
            await stakeToken.connect(user1).stake(amount, numDays);

            // Advance the block timestamp by 31 days
            await ethers.provider.send("evm_increaseTime", [60 * 60 * 24 * 31]);
          
            await stakeToken.connect(user1).claimRewards(stakeId);

            const balance = await token.balanceOf(user1.address);
            expect(Number(balance).toString()).to.equal(ethers.utils.parseEther("910"))

            const stake = await stakeToken.getStakeById(stakeId);
            expect(stake.daysToReward).to.equal(0);
            expect(stake.lastRewardTimestamp).to.equal((await time.latest()));
          });
    });

    describe("admin", function() {
        it("Should initialize the contract correctly", async function () {
            expect(await stakeToken.initialized()).to.equal(true);
            expect(await stakeToken.rewardsWallet()).to.equal(rewardsWallet);
            expect(await stakeToken.exitPenaltyFee()).to.equal(exitPenaltyFee);
            expect(await stakeToken.tiers(14)).to.equal(twoWeeksApy);
            expect(await stakeToken.tiers(30)).to.equal(oneMonthApy);
            expect(await stakeToken.tiers(90)).to.equal(threeMonthApy);
            expect(await stakeToken.tiers(180)).to.equal(sixMonthApy);
            expect(await stakeToken.tiers(360)).to.equal(oneYearApy);
            expect(await stakeToken.lockPeriods(0)).to.equal(14);
            expect(await stakeToken.lockPeriods(1)).to.equal(30);
            expect(await stakeToken.lockPeriods(2)).to.equal(90);
            expect(await stakeToken.lockPeriods(3)).to.equal(180);
            expect(await stakeToken.lockPeriods(4)).to.equal(360);
        });

        it("Should set rewards wallect correctly", async function () {
            //error from non owner
            await expect(stakeToken.connect(user2).setRewardsWallet(user2.address)).to.be.revertedWith("Ownable: caller is not the owner");

            //set new address
            await stakeToken.connect(owner).setRewardsWallet(user2.address);
            expect(await stakeToken.rewardsWallet()).to.equal(user2.address);
        });

        it("Should modify lock period correctly", async function () {
            //add a new lock period for 7 days
            const numDays = 7;
            const apy = 2;
            await stakeToken.connect(owner).modifyLockPeriods(numDays, apy);

            //modify exsiting lock  
            await stakeToken.connect(owner).modifyLockPeriods(30, 12);

            const lockPeriodsArray = await stakeToken.getLockPeriods();

            expect(lockPeriodsArray[lockPeriodsArray.length - 1]).to.equal(numDays);
            expect(await stakeToken.tiers(numDays)).to.equal(apy);
            expect(await stakeToken.tiers(30)).to.equal(12);
        });

        it("Should modify exit penalty fee", async function () {
            //set new penalty to zero
            await expect(stakeToken.connect(owner).updateExitPenalty(0)).to.be.revertedWith("Penalty should not be zero");

            //modify penalty fee 
            await stakeToken.connect(owner).updateExitPenalty(4);
            expect(await stakeToken.exitPenaltyFee()).to.equal(4);
        });

        it("Should withdraw rewards from emergency unstake in contract", async function () {
            const amount = ethers.utils.parseEther("100");

            await expect(stakeToken.connect(owner).emergencyRewardWithdraw(amount, user2.address)).to.be.revertedWith("not enough tokens to take out");
            
            const numDays = 30;
            const stakeId = 1;

            await token.connect(user1).approve(stakeToken.address, amount);
            await stakeToken.connect(user1).stake(amount, numDays);

            await stakeToken.connect(user1).emergencyUnstake(stakeId);

            //contract rewards for emergency unstake
            const rewards = (amount * exitPenaltyFee / 100);

            await stakeToken.connect(owner).emergencyRewardWithdraw(rewards.toString(), user2.address);

            //contract balance after withdraw
            const balanceContract = await token.balanceOf(stakeToken.address);
            expect(balanceContract).to.equal("0");
        });
    });

});






