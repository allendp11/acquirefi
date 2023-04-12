// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/Counters.sol";


contract Staking is Ownable {
    using Counters for Counters.Counter;
    Counters.Counter _stakeId;

    struct Stake {
        address owner;
        uint256 amount;
        uint256 createdDate;
        uint256 unlockDate;
        uint256 dailyReward;
        uint256 daysToReward;
        uint256 lastRewardTimestamp;
        bool open;
    }

    IERC20 public token;
    address public rewardsWallet;
    bool public initialized;
    uint256 public currentlyStaked;
    uint256 public exitPenaltyFee;
    uint256[] public lockPeriods;

    // Stakes by the user indexed by address
    mapping(uint256 => Stake) public stakes;
    mapping(address => uint256[]) public stakeIdsByAddress;
    mapping(uint256 => uint256) public tiers;

    event Staked(address indexed staker, uint256 stakeId, uint256 amount, uint256 endsAt);
    event Unstaked(address indexed staker, uint256 stakeId, uint256 amount);

    constructor(IERC20 _token) {
        token = _token;
    }

    modifier stakeIdExist(uint256 id) {
        require(id > 0 && id <= _stakeId.current(), "Stake id does not exist");
        _;
    }

    function initializeStaking(
        uint256 _twoWeeksApy,
        uint256 _oneMonthApy,
        uint256 _threeMonthApy,
        uint256 _sixMonthApy,
        uint256 _oneYearApy,
        address _rewardsWallet,
        uint256 _exitPenaltyFee
    ) external onlyOwner {
        require(!initialized, "Contract initialized already");
        require(
            _oneMonthApy > 0 && _threeMonthApy > 0 && _sixMonthApy > 0 && _oneYearApy > 0,
            "One of the Rewards is zero"
        );
        initialized = true;
        rewardsWallet = _rewardsWallet;
        exitPenaltyFee = _exitPenaltyFee;

        tiers[14] = _twoWeeksApy;
        tiers[30] = _oneMonthApy;
        tiers[90] = _threeMonthApy;
        tiers[180] = _sixMonthApy;
        tiers[360] = _oneYearApy;

        lockPeriods.push(14);
        lockPeriods.push(30);
        lockPeriods.push(90);
        lockPeriods.push(180);
        lockPeriods.push(360);
    }

    function setRewardsWallet(address _newWallet) external onlyOwner {
        rewardsWallet = _newWallet;
    }

    function stake(uint256 _amount, uint256 _numDays) public {
        require(tiers[_numDays] > 0, "Staking Time should be in time limits defined");
        require(_amount > 0, "Staking must be greater then zero");

        token.transferFrom(msg.sender, address(this), _amount);

        _stakeId.increment();
        uint256 stakeId = _stakeId.current();
        uint256 endDate = block.timestamp + (_numDays * 1 days);

        stakes[stakeId] = Stake(
            msg.sender,
            _amount,
            block.timestamp,
            endDate,
            calculateDailyRewards(_amount, _numDays),
            _numDays,
            block.timestamp,
            true
        );

        stakeIdsByAddress[msg.sender].push(stakeId);
        currentlyStaked += _amount;

        emit Staked(msg.sender, stakeId, _amount, endDate);
    }

    function calculateDailyRewards(uint256 _amount, uint256 _numDays) private view returns(uint256) {
        return _amount * tiers[_numDays] / 100 / _numDays;
    }

    function unstake(uint256 stakeId) public stakeIdExist(stakeId) {
        Stake memory s = stakes[stakeId];

        require(s.open, "Stake is closed");
        require(msg.sender == s.owner, "Only owner can unstake");
        require(s.unlockDate <= block.timestamp, "Cannot unstake before maturity");

        if (s.daysToReward > 0) claimRewards(stakeId);

        stakes[stakeId].open = false;
        stakes[stakeId].daysToReward = 0;
        currentlyStaked -= s.amount;

        emit Unstaked(s.owner, stakeId, s.amount);

        token.transfer(s.owner, s.amount);
    }


    function emergencyUnstake(uint256 stakeId) public stakeIdExist(stakeId) {
        Stake memory s = stakes[stakeId];

        require(s.open, "Stake is closed");
        require(msg.sender == s.owner, "Only owner can unstake");
        uint256 newAmount = s.amount - (s.amount * exitPenaltyFee / 100);

        stakes[stakeId].open = false;
        stakes[stakeId].daysToReward = 0;
        currentlyStaked -= s.amount;
        emit Unstaked(s.owner, stakeId, s.amount);

        token.transfer(s.owner, newAmount);
    }

    function claimRewards(uint256 stakeId) public stakeIdExist(stakeId) {
        Stake memory s = stakes[stakeId];

        require(s.open, "stake is closed");
        require(msg.sender == s.owner, "Only owner can claim");
        require(s.daysToReward > 0, "You have already claimed all the daily rewards in this stake");

        uint256 daysUnclaimed = (block.timestamp - s.lastRewardTimestamp) / 1 days;
        if (s.daysToReward < daysUnclaimed) daysUnclaimed = s.daysToReward;
        
        require(daysUnclaimed > 0, "Wait at least 1 day to claim rewards");

        token.transferFrom(rewardsWallet, s.owner, (daysUnclaimed * s.dailyReward));

        stakes[stakeId].lastRewardTimestamp = block.timestamp;
        stakes[stakeId].daysToReward -= daysUnclaimed;
    }

    function modifyLockPeriods(uint256 _numDays, uint256 _apy) external onlyOwner {
        require(_apy > 0, "invalid apy");

        if(tiers[_numDays] == 0) lockPeriods.push(_numDays);
        tiers[_numDays] = _apy;
    }

    function getLockPeriods() external view returns(uint256[] memory) {
        return lockPeriods;
    }

    function getIntrestRate(uint256 _numDays) external view returns(uint256) {
        return tiers[_numDays];
    }

    function getStakeById(uint256 stakeId) external view stakeIdExist(stakeId) returns(Stake memory) {
        return stakes[stakeId];
    }

    function getStakeIdsForAddress(address _address) external view returns(uint256[] memory) {
        return stakeIdsByAddress[_address];
    }

    function totalStakes() external view returns(uint256) {
        return _stakeId.current();
    }

    function updateExitPenalty(uint256 _newPenalty) external onlyOwner {
        require(_newPenalty > 0 , "Penalty should not be zero");
        exitPenaltyFee = _newPenalty;
    }

    // Withdraw reward from contract. 
    function emergencyRewardWithdraw(uint256 _amount, address _address) external onlyOwner {
        require(_amount <= token.balanceOf(address(this)), "not enough tokens to take out");
        token.transfer(_address, _amount);
    }
}