// SPDX-License-Identifier: MIT
// OpenZeppelin Contracts v4.4.1 (utils/introspection/ERC165.sol)

pragma solidity 0.8.4;

import "../interfaces/IERC165.sol";

/**
 * @dev Implementation of the {IERC165} interface.
 *
 * Contracts that want to implement ERC165 should inherit from this contract and override {supportsInterface} to check
 * for the additional interface id that will be supported. For example:
 *
 * ```solidity
 * function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
 *     return interfaceId == type(MyInterface).interfaceId || super.supportsInterface(interfaceId);
 * }
 * ```
 *
 * Alternatively, {ERC165Storage} provides an easier to use but more expensive implementation.
 */
abstract contract ERC165 is IERC165 {
    /**
     * @dev See {IERC165-supportsInterface}.
     */
    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
        return interfaceId == type(IERC165).interfaceId;
    }

    // *************************************************************
    //                        HELPER FUNCTIONS
    // *************************************************************

    /// @author bogdoslav

    /// @dev Checks what interface with id is supported by contract.
    /// @returns bool. Do not throws
    function _isInterfaceSupported(address contractAddress, bytes4 interfaceId) internal view returns (bool) {
        // check what address is contract
        uint codeSize;
        assembly {
            codeSize := extcodesize(contractAddress)
        }
        if (codeSize == 0) return false;

        try IERC165(contractAddress).supportsInterface(interfaceId) returns (bool isSupported) {
            return isSupported;
        } catch {
        }
        return false;
    }

    /// @dev Checks what interface with id is supported by contract and reverts otherwise
    function _requireInterface(address contractAddress, bytes4 interfaceId) internal view {
        require(_isInterfaceSupported(contractAddress, interfaceId), 'Interface is not supported');
    }
}
