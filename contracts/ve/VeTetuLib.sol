// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.17;

import "../openzeppelin/Math.sol";
import "../interfaces/IVeTetu.sol";
import "../lib/Base64.sol";
import "./../lib/StringLib.sol";
import "hardhat/console.sol";

/// @title Library with additional ve functions
/// @author belbix
library VeTetuLib {
  using Math for uint;

  uint internal constant WEEK = 1 weeks;
  uint internal constant MULTIPLIER = 1 ether;
  int128 internal constant I_MAX_TIME = 16 weeks;
  uint internal constant WEIGHT_DENOMINATOR = 100e18;

  // Only for internal usage
  struct CheckpointInfo {
    uint tokenId;
    uint oldDerivedAmount;
    uint newDerivedAmount;
    uint oldEnd;
    uint newEnd;
    uint epoch;
    IVeTetu.Point uOld;
    IVeTetu.Point uNew;
    int128 oldDSlope;
    int128 newDSlope;
  }

  ////////////////////////////////////////////////////
  //  MAIN LOGIC
  ////////////////////////////////////////////////////

  function calculateDerivedAmount(
    uint currentAmount,
    uint oldDerivedAmount,
    uint newAmount,
    uint weight,
    uint8 decimals
  ) internal pure returns (uint) {
    // subtract current derived balance
    // rounded to UP for subtracting closer to 0 value
    if (oldDerivedAmount != 0 && currentAmount != 0) {
      currentAmount = currentAmount.mulDiv(1e18, 10 ** decimals, Math.Rounding.Up);
      uint currentDerivedAmount = currentAmount.mulDiv(weight, WEIGHT_DENOMINATOR, Math.Rounding.Up);
      if (oldDerivedAmount > currentDerivedAmount) {
        oldDerivedAmount -= currentDerivedAmount;
      } else {
        // in case of wrong rounding better to set to zero than revert
        oldDerivedAmount = 0;
      }
    }

    // recalculate derived amount with new amount
    // rounded to DOWN
    // normalize decimals to 18
    newAmount = newAmount.mulDiv(1e18, 10 ** decimals, Math.Rounding.Down);
    // calculate the final amount based on the weight
    newAmount = newAmount.mulDiv(weight, WEIGHT_DENOMINATOR, Math.Rounding.Down);
    return oldDerivedAmount + newAmount;
  }

  /// @notice Binary search to estimate timestamp for block number
  /// @param _block Block to find
  /// @param maxEpoch Don't go beyond this epoch
  /// @return Approximate timestamp for block
  function findBlockEpoch(uint _block, uint maxEpoch, mapping(uint => IVeTetu.Point) storage _pointHistory) public view returns (uint) {
    // Binary search
    uint _min = 0;
    uint _max = maxEpoch;
    for (uint i = 0; i < 128; ++i) {
      // Will be always enough for 128-bit numbers
      if (_min >= _max) {
        break;
      }
      uint _mid = (_min + _max + 1) / 2;
      if (_pointHistory[_mid].blk <= _block) {
        _min = _mid;
      } else {
        _max = _mid - 1;
      }
    }
    return _min;
  }

  /// @notice Measure voting power of `_tokenId` at block height `_block`
  /// @return resultBalance Voting power
  function balanceOfAtNFT(
    uint _tokenId,
    uint _block,
    uint maxEpoch,
    uint lockedDerivedAmount,
    mapping(uint => uint) storage userPointEpoch,
    mapping(uint => IVeTetu.Point[1000000000]) storage _userPointHistory,
    mapping(uint => IVeTetu.Point) storage _pointHistory
  ) external view returns (uint resultBalance) {

    // Binary search closest user point
    uint _min = 0;
    {
      uint _max = userPointEpoch[_tokenId];
      for (uint i = 0; i < 128; ++i) {
        // Will be always enough for 128-bit numbers
        if (_min >= _max) {
          break;
        }
        uint _mid = (_min + _max + 1) / 2;
        if (_userPointHistory[_tokenId][_mid].blk <= _block) {
          _min = _mid;
        } else {
          _max = _mid - 1;
        }
      }
    }

    IVeTetu.Point memory uPoint = _userPointHistory[_tokenId][_min];

    // nft does not exist at this block
    if (uPoint.blk > _block) {
      return 0;
    }

    // need to calculate timestamp for the given block
    uint blockTime;
    if (_block <= block.number) {
      uint _epoch = findBlockEpoch(_block, maxEpoch, _pointHistory);
      IVeTetu.Point memory point0 = _pointHistory[_epoch];
      uint dBlock = 0;
      uint dt = 0;
      if (_epoch < maxEpoch) {
        IVeTetu.Point memory point1 = _pointHistory[_epoch + 1];
        dBlock = point1.blk - point0.blk;
        dt = point1.ts - point0.ts;
      } else {
        dBlock = block.number - point0.blk;
        dt = block.timestamp - point0.ts;
      }
      blockTime = point0.ts;
      if (dBlock != 0 && _block > point0.blk) {
        blockTime += (dt * (_block - point0.blk)) / dBlock;
      }
    } else {
      // we can not calculate estimation if no checkpoints
      if (maxEpoch == 0) {
        return 0;
      }
      // for future blocks will use a simple estimation
      IVeTetu.Point memory point0 = _pointHistory[maxEpoch - 1];
      uint tsPerBlock18 = (block.timestamp - point0.ts) * 1e18 / (block.number - point0.blk);
      blockTime = block.timestamp + tsPerBlock18 * (_block - block.number) / 1e18;
    }

    uPoint.bias -= uPoint.slope * int128(int256(blockTime - uPoint.ts));

    resultBalance = uint(uint128(_positiveInt128(uPoint.bias)));

    // make sure we do not return more than nft has
    if (resultBalance > lockedDerivedAmount) {
      return 0;
    }
  }

  /// @notice Calculate total voting power at some point in the past
  /// @param point The point (bias/slope) to start search from
  /// @param t Time to calculate the total voting power at
  /// @return Total voting power at that time
  function supplyAt(IVeTetu.Point memory point, uint t, mapping(uint => int128) storage slopeChanges) public view returns (uint) {
    // this function will return positive value even for block when contract does not exist
    // for reduce gas cost we assume that it will not be used in such form

    IVeTetu.Point memory lastPoint = point;
    uint ti = (lastPoint.ts / WEEK) * WEEK;
    for (uint i = 0; i < 255; ++i) {
      ti += WEEK;
      int128 dSlope = 0;
      if (ti > t) {
        ti = t;
      } else {
        dSlope = slopeChanges[ti];
      }
      lastPoint.bias -= lastPoint.slope * int128(int256(ti) - int256(lastPoint.ts));
      if (ti == t) {
        break;
      }
      lastPoint.slope += dSlope;
      lastPoint.ts = ti;
    }
    return uint(uint128(_positiveInt128(lastPoint.bias)));
  }

  /// @notice Calculate total voting power at some point in the past
  /// @param _block Block to calculate the total voting power at
  /// @return Total voting power at `_block`
  function totalSupplyAt(
    uint _block,
    uint _epoch,
    mapping(uint => IVeTetu.Point) storage _pointHistory,
    mapping(uint => int128) storage slopeChanges
  ) external view returns (uint) {
    require(_block <= block.number, "WRONG_INPUT");

    uint targetEpoch = findBlockEpoch(_block, _epoch, _pointHistory);

    IVeTetu.Point memory point = _pointHistory[targetEpoch];
    // it is possible only for a block before the launch
    // return 0 as more clear answer than revert
    if (point.blk > _block) {
      return 0;
    }
    uint dt = 0;
    if (targetEpoch < _epoch) {
      IVeTetu.Point memory pointNext = _pointHistory[targetEpoch + 1];
      // next point block can not be the same or lower
      dt = ((_block - point.blk) * (pointNext.ts - point.ts)) / (pointNext.blk - point.blk);
    } else {
      if (point.blk != block.number) {
        dt = ((_block - point.blk) * (block.timestamp - point.ts)) / (block.number - point.blk);
      }
    }
    // Now dt contains info on how far are we beyond point
    return supplyAt(point, point.ts + dt, slopeChanges);
  }

  /// @notice Record global and per-user data to checkpoint
  function checkpoint(
    uint tokenId,
    uint oldDerivedAmount,
    uint newDerivedAmount,
    uint oldEnd,
    uint newEnd,
    uint epoch,
    mapping(uint => int128) storage slopeChanges,
    mapping(uint => uint) storage userPointEpoch,
    mapping(uint => IVeTetu.Point[1000000000]) storage _userPointHistory,
    mapping(uint => IVeTetu.Point) storage _pointHistory
  ) external returns (uint newEpoch) {
    IVeTetu.Point memory uOld;
    IVeTetu.Point memory uNew;
    return _checkpoint(
      CheckpointInfo({
        tokenId: tokenId,
        oldDerivedAmount: oldDerivedAmount,
        newDerivedAmount: newDerivedAmount,
        oldEnd: oldEnd,
        newEnd: newEnd,
        epoch: epoch,
        uOld: uOld,
        uNew: uNew,
        oldDSlope: 0,
        newDSlope: 0
      }),
      slopeChanges,
      userPointEpoch,
      _userPointHistory,
      _pointHistory
    );
  }

  function _checkpoint(
    CheckpointInfo memory info,
    mapping(uint => int128) storage slopeChanges,
    mapping(uint => uint) storage userPointEpoch,
    mapping(uint => IVeTetu.Point[1000000000]) storage _userPointHistory,
    mapping(uint => IVeTetu.Point) storage _pointHistory
  ) internal returns (uint newEpoch) {
    if (info.tokenId != 0) {
      // Calculate slopes and biases
      // Kept at zero when they have to
      if (info.oldEnd > block.timestamp && info.oldDerivedAmount > 0) {
        info.uOld.slope = int128(uint128(info.oldDerivedAmount)) / I_MAX_TIME;
        info.uOld.bias = info.uOld.slope * int128(int256(info.oldEnd - block.timestamp));
      }
      if (info.newEnd > block.timestamp && info.newDerivedAmount > 0) {
        info.uNew.slope = int128(uint128(info.newDerivedAmount)) / I_MAX_TIME;
        info.uNew.bias = info.uNew.slope * int128(int256(info.newEnd - block.timestamp));
      }

      // Read values of scheduled changes in the slope
      // oldLocked.end can be in the past and in the future
      // newLocked.end can ONLY by in the FUTURE unless everything expired: than zeros
      info.oldDSlope = slopeChanges[info.oldEnd];
      if (info.newEnd != 0) {
        if (info.newEnd == info.oldEnd) {
          info.newDSlope = info.oldDSlope;
        } else {
          info.newDSlope = slopeChanges[info.newEnd];
        }
      }
    }

    IVeTetu.Point memory lastPoint = IVeTetu.Point({bias: 0, slope: 0, ts: block.timestamp, blk: block.number});
    if (info.epoch > 0) {
      lastPoint = _pointHistory[info.epoch];
    }
    uint lastCheckpoint = lastPoint.ts;
    // initialLastPoint is used for extrapolation to calculate block number
    // (approximately, for *At methods) and save them
    // as we cannot figure that out exactly from inside the contract

    // WRONG IVeTetu.Point memory initialLastPoint = lastPoint;
    IVeTetu.Point memory initialLastPoint = IVeTetu.Point({
      ts: lastPoint.ts,
      slope: lastPoint.slope,
      blk: lastPoint.blk,
      bias: lastPoint.bias
    });
    console.log("lastPoint.0.blk,bias", lastPoint.blk);console.logInt(lastPoint.bias);
    console.log("lastPoint.0.ts,slope", lastPoint.ts);console.logInt(lastPoint.slope);
    console.log("initialLastPoint.0.blk,bias", initialLastPoint.blk);console.logInt(initialLastPoint.bias);
    console.log("initialLastPoint.0.ts,slope", initialLastPoint.ts);console.logInt(initialLastPoint.slope);

    uint blockSlope = 0;
    // dblock/dt
    if (block.timestamp > lastPoint.ts) {
      blockSlope = (MULTIPLIER * (block.number - lastPoint.blk)) / (block.timestamp - lastPoint.ts);
    }
    // If last point is already recorded in this block, slope=0
    // But that's ok b/c we know the block in such case

    // Go over weeks to fill history and calculate what the current point is
    {
      uint ti = (lastCheckpoint / WEEK) * WEEK;
      // Hopefully it won't happen that this won't get used in 5 years!
      // If it does, users will be able to withdraw but vote weight will be broken
      for (uint i = 0; i < 255; ++i) {
        ti += WEEK;
        int128 dSlope = 0;
        if (ti > block.timestamp) {
          ti = block.timestamp;
        } else {
          dSlope = slopeChanges[ti];
        }
        lastPoint.bias = _positiveInt128(lastPoint.bias - lastPoint.slope * int128(int256(ti - lastCheckpoint)));
        lastPoint.slope = _positiveInt128(lastPoint.slope + dSlope);
        lastCheckpoint = ti;
        lastPoint.ts = ti;
        lastPoint.blk = initialLastPoint.blk + (blockSlope * (ti - initialLastPoint.ts)) / MULTIPLIER;

        info.epoch += 1;
        if (ti == block.timestamp) {
          lastPoint.blk = block.number;
          break;
        } else {
          _pointHistory[info.epoch] = lastPoint;
        }
      }
    }
    console.log("lastPoint.final.blk,bias", lastPoint.blk);console.logInt(lastPoint.bias);
    console.log("lastPoint.final.ts,slope", lastPoint.ts);console.logInt(lastPoint.slope);
    console.log("initialLastPoint.final.blk,bias", initialLastPoint.blk);console.logInt(initialLastPoint.bias);
    console.log("initialLastPoint.final.ts,slope", initialLastPoint.ts);console.logInt(initialLastPoint.slope);

    newEpoch = info.epoch;
    // Now pointHistory is filled until t=now

    if (info.tokenId != 0) {
      // If last point was in this block, the slope change has been applied already
      // But in such case we have 0 slope(s)
      lastPoint.slope = _positiveInt128(lastPoint.slope + (info.uNew.slope - info.uOld.slope));
      lastPoint.bias = _positiveInt128(lastPoint.bias + (info.uNew.bias - info.uOld.bias));
    }

    // Record the changed point into history
    _pointHistory[info.epoch] = lastPoint;

    if (info.tokenId != 0) {
      // Schedule the slope changes (slope is going down)
      // We subtract newUserSlope from [newLocked.end]
      // and add old_user_slope to [old_locked.end]
      if (info.oldEnd > block.timestamp) {
        // old_dslope was <something> - u_old.slope, so we cancel that
        info.oldDSlope += info.uOld.slope;
        if (info.newEnd == info.oldEnd) {
          info.oldDSlope -= info.uNew.slope;
          // It was a new deposit, not extension
        }
        slopeChanges[info.oldEnd] = info.oldDSlope;
      }

      if (info.newEnd > block.timestamp) {
        if (info.newEnd > info.oldEnd) {
          info.newDSlope -= info.uNew.slope;
          // old slope disappeared at this point
          slopeChanges[info.newEnd] = info.newDSlope;
        }
        // else: we recorded it already in oldDSlope
      }
      // Now handle user history
      uint userEpoch = userPointEpoch[info.tokenId] + 1;

      userPointEpoch[info.tokenId] = userEpoch;
      info.uNew.ts = block.timestamp;
      info.uNew.blk = block.number;
      _userPointHistory[info.tokenId][userEpoch] = info.uNew;
    }
  }

  function _positiveInt128(int128 value) internal pure returns (int128) {
    return value < 0 ? int128(0) : value;
  }

  /// @dev Return SVG logo of veTETU.
  function tokenURI(uint _tokenId, uint _balanceOf, uint untilEnd, uint _value) public pure returns (string memory output) {
    output = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 900"><style>.base{font-size:40px;}</style><rect fill="#193180" width="600" height="900"/><path fill="#4899F8" d="M0,900h600V522.2C454.4,517.2,107.4,456.8,60.2,0H0V900z"/><circle fill="#1B184E" cx="385" cy="212" r="180"/><circle fill="#04A8F0" cx="385" cy="142" r="42"/><path fill-rule="evenodd" clip-rule="evenodd" fill="#686DF1" d="M385.6,208.8c43.1,0,78-34.9,78-78c-1.8-21.1,16.2-21.1,21.1-15.4c0.4,0.3,0.7,0.7,1.1,1.2c16.7,21.5,26.6,48.4,26.6,77.7c0,25.8-24.4,42.2-50.2,42.2H309c-25.8,0-50.2-16.4-50.2-42.2c0-29.3,9.9-56.3,26.6-77.7c0.3-0.4,0.7-0.8,1.1-1.2c4.9-5.7,22.9-5.7,21.1,15.4l0,0C307.6,173.9,342.5,208.8,385.6,208.8z"/><path fill="#04A8F0" d="M372.3,335.9l-35.5-51.2c-7.5-10.8,0.2-25.5,13.3-25.5h35.5h35.5c13.1,0,20.8,14.7,13.3,25.5l-35.5,51.2C392.5,345.2,378.7,345.2,372.3,335.9z"/>';
    output = string(abi.encodePacked(output, '<text transform="matrix(1 0 0 1 50 464)" fill="#EAECFE" class="base">ID:</text><text transform="matrix(1 0 0 1 50 506)" fill="#97D0FF" class="base">', StringLib._toString(_tokenId), '</text>'));
    output = string(abi.encodePacked(output, '<text transform="matrix(1 0 0 1 50 579)" fill="#EAECFE" class="base">Balance:</text><text transform="matrix(1 0 0 1 50 621)" fill="#97D0FF" class="base">', StringLib._toString(_balanceOf / 1e18), '</text>'));
    output = string(abi.encodePacked(output, '<text transform="matrix(1 0 0 1 50 695)" fill="#EAECFE" class="base">Until unlock:</text><text transform="matrix(1 0 0 1 50 737)" fill="#97D0FF" class="base">', StringLib._toString(untilEnd / 60 / 60 / 24), ' days</text>'));
    output = string(abi.encodePacked(output, '<text transform="matrix(1 0 0 1 50 811)" fill="#EAECFE" class="base">Power:</text><text transform="matrix(1 0 0 1 50 853)" fill="#97D0FF" class="base">', StringLib._toString(_value / 1e18), '</text></svg>'));

    string memory json = Base64.encode(bytes(string(abi.encodePacked('{"name": "veTETU #', StringLib._toString(_tokenId), '", "description": "Locked TETU tokens", "image": "data:image/svg+xml;base64,', Base64.encode(bytes(output)), '"}'))));
    output = string(abi.encodePacked('data:application/json;base64,', json));
  }

}
