// SPDX-License-Identifier: MIT
// Sources flattened with hardhat v2.5.0 https://hardhat.org

// File contracts/interfaces/IAdminProjectRouter.sol


pragma solidity ^0.8.17;

interface IAdminProjectRouter {
    function isSuperAdmin(address _addr, string calldata _project) external view returns (bool);

    function isAdmin(address _addr, string calldata _project) external view returns (bool);
}


// File contracts/abstracts/standard/Authorization.sol

abstract contract Authorization {
    IAdminProjectRouter public adminProjectRouter;
    string public PROJECT; // Fill the project name

    event AdminProjectRouterSet(address indexed oldAdmin, address indexed newAdmin, address indexed caller);

    modifier onlySuperAdmin() {
        require(adminProjectRouter.isSuperAdmin(msg.sender, PROJECT), "Authorization: restricted only super admin");
        _;
    }

    modifier onlyAdmin() {
        require(adminProjectRouter.isAdmin(msg.sender, PROJECT), "Authorization: restricted only admin");
        _;
    }

    modifier onlySuperAdminOrAdmin() {
        require(
            adminProjectRouter.isSuperAdmin(msg.sender, PROJECT) || adminProjectRouter.isAdmin(msg.sender, PROJECT),
            "Authorization: restricted only super admin or admin"
        );
        _;
    }

    function setAdminProjectRouter(address _adminProjectRouter) public virtual onlySuperAdmin {
        require(_adminProjectRouter != address(0), "Authorization: new admin project router is the zero address");
        emit AdminProjectRouterSet(address(adminProjectRouter), _adminProjectRouter, msg.sender);
        adminProjectRouter = IAdminProjectRouter(_adminProjectRouter);
    }
}


// File contracts/interfaces/IKYCBitkubChain.sol


interface IKYCBitkubChain {
    function kycsLevel(address _addr) external view returns (uint256);
}


// File contracts/abstracts/standard/KYCHandler.sol



abstract contract KYCHandler {
    IKYCBitkubChain public kyc;

    uint256 public acceptedKYCLevel;
    bool public isActivatedOnlyKYCAddress;

    function _activateOnlyKYCAddress() internal virtual {
        isActivatedOnlyKYCAddress = true;
    }

    function _setKYC(address _kyc) internal virtual {
        kyc = IKYCBitkubChain(_kyc);
    }

    function _setAcceptedKYCLevel(uint256 _kycLevel) internal virtual {
        acceptedKYCLevel = _kycLevel;
    }
}


// File contracts/abstracts/Committee.sol



abstract contract Committee {
    address public committee;

    event CommitteeSet(address indexed oldCommittee, address indexed newCommittee, address indexed caller);

    modifier onlyCommittee() {
        require(msg.sender == committee, "Committee: restricted only committee");
        _;
    }

    function setCommittee(address _committee) public virtual onlyCommittee {
        emit CommitteeSet(committee, _committee, msg.sender);
        committee = _committee;
    }
}


// File contracts/abstracts/Context.sol



abstract contract Context {
    function _msgSender() internal view virtual returns (address) {
        return msg.sender;
    }

    function _msgData() internal view virtual returns (bytes calldata) {
        return msg.data;
    }
}


// File contracts/abstracts/Ownable.sol



abstract contract Ownable is Context {
    address private _owner;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    constructor() {
        _transferOwnership(_msgSender());
    }

    function owner() public view virtual returns (address) {
        return _owner;
    }

    modifier onlyOwner() {
        require(owner() == _msgSender(), "Ownable: caller is not the owner");
        _;
    }

    function renounceOwnership() public virtual onlyOwner {
        _transferOwnership(address(0));
    }

    function transferOwnership(address newOwner) public virtual onlyOwner {
        require(newOwner != address(0), "Ownable: new owner is the zero address");
        _transferOwnership(newOwner);
    }

    function _transferOwnership(address newOwner) internal virtual {
        address oldOwner = _owner;
        _owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }
}


// File contracts/abstracts/standard/AccessController.sol


abstract contract AccessController is Authorization, KYCHandler, Ownable, Committee {
    address public transferRouter;

    event TransferRouterSet(
        address indexed oldTransferRouter,
        address indexed newTransferRouter,
        address indexed caller
    );

    modifier onlyOwnerOrCommittee() {
        require(
            msg.sender == owner() || msg.sender == committee,
            "AccessController: restricted only owner or committee"
        );
        _;
    }

    modifier onlySuperAdminOrTransferRouter() {
        require(
            adminProjectRouter.isSuperAdmin(msg.sender, PROJECT) || msg.sender == transferRouter,
            "AccessController: restricted only super admin or transfer router"
        );
        _;
    }

    modifier onlySuperAdminOrCommittee() {
        require(
            adminProjectRouter.isSuperAdmin(msg.sender, PROJECT) || msg.sender == committee,
            "AccessController: restricted only super admin or committee"
        );
        _;
    }

    modifier onlySuperAdminOrOwner() {
        require(
            adminProjectRouter.isSuperAdmin(msg.sender, PROJECT) || msg.sender == owner(),
            "AccessController: restricted only super admin or owner"
        );
        _;
    }

    function activateOnlyKYCAddress() external onlyCommittee {
        _activateOnlyKYCAddress();
    }

    function setKYC(address _kyc) external onlyCommittee {
        _setKYC(_kyc);
    }

    function setAcceptedKYCLevel(uint256 _kycLevel) external onlyCommittee {
        _setAcceptedKYCLevel(_kycLevel);
    }

    function setTransferRouter(address _transferRouter) external onlyOwnerOrCommittee {
        emit TransferRouterSet(transferRouter, _transferRouter, msg.sender);
        transferRouter = _transferRouter;
    }

    function setAdminProjectRouter(address _adminProjectRouter) public override onlyOwnerOrCommittee {
        require(_adminProjectRouter != address(0), "Authorization: new admin project router is the zero address");
        emit AdminProjectRouterSet(address(adminProjectRouter), _adminProjectRouter, msg.sender);
        adminProjectRouter = IAdminProjectRouter(_adminProjectRouter);
    }
}


// File contracts/abstracts/standard/Pausable.sol



abstract contract Pausable {
    event Paused(address account);

    event Unpaused(address account);

    bool public paused;

    constructor() {
        paused = false;
    }

    modifier whenNotPaused() {
        require(!paused, "Pausable: paused");
        _;
    }

    modifier whenPaused() {
        require(paused, "Pausable: not paused");
        _;
    }

    function _pause() internal virtual whenNotPaused {
        paused = true;
        emit Paused(msg.sender);
    }

    function _unpause() internal virtual whenPaused {
        paused = false;
        emit Unpaused(msg.sender);
    }
}


// File contracts/interfaces/IKAP165.sol



interface IKAP165 {
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}


// File contracts/abstracts/KAP165.sol



abstract contract KAP165 is IKAP165 {
    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
        return interfaceId == type(IKAP165).interfaceId;
    }
}


// File contracts/interfaces/IKAP721/IKAP721.sol



interface IKAP721 is IKAP165 {
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);

    function balanceOf(address owner) external view returns (uint256 balance);

    function ownerOf(uint256 tokenId) external view returns (address owner);

    function safeTransferFrom(
        address from,
        address to,
        uint256 tokenId
    ) external;

    function transferFrom(
        address from,
        address to,
        uint256 tokenId
    ) external;

    function adminTransfer(
        address from,
        address to,
        uint256 tokenId
    ) external;

    function internalTransfer(
        address from,
        address to,
        uint256 tokenId
    ) external returns (bool);

    function externalTransfer(
        address from,
        address to,
        uint256 tokenId
    ) external returns (bool);

    function approve(address to, uint256 tokenId) external;

    function getApproved(uint256 tokenId) external view returns (address operator);

    function setApprovalForAll(address operator, bool approved) external;

    function isApprovedForAll(address owner, address operator) external view returns (bool);

    function safeTransferFrom(
        address from,
        address to,
        uint256 tokenId,
        bytes calldata data
    ) external;
}


// File contracts/interfaces/IKAP721/IKAP721V2.sol



interface IKAP721V2 {
    function tokenOfOwnerByPage(
        address owner,
        uint256 page,
        uint256 limit
    ) external view returns (uint256[] memory);

    function tokenOfOwnerAll(address owner) external view returns (uint256[] memory);

    function adminApprove(address to, uint256 tokenId) external;

    function adminSetApprovalForAll(
        address owner,
        address operator,
        bool approved
    ) external;
}


// File contracts/interfaces/IKAP721/IKAP721Metadata.sol



interface IKAP721Metadata {
    function name() external view returns (string memory);

    function symbol() external view returns (string memory);

    function tokenURI(uint256 tokenId) external view returns (string memory);
}


// File contracts/interfaces/IKAP721/IKAP721Enumerable.sol



interface IKAP721Enumerable {
    function totalSupply() external view returns (uint256);

    function tokenOfOwnerByIndex(address owner, uint256 index) external view returns (uint256 tokenId);

    function tokenByIndex(uint256 index) external view returns (uint256);
}


// File contracts/interfaces/IKAP721/IKAP721Receiver.sol



interface IKAP721Receiver {
    function onKAP721Received(
        address operator,
        address from,
        uint256 tokenId,
        bytes calldata data
    ) external returns (bytes4);
}


// File contracts/libraries/Address.sol



library Address {
    function isContract(address account) internal view returns (bool) {
        // This method relies on extcodesize, which returns 0 for contracts in
        // construction, since the code is only stored at the end of the
        // constructor execution.

        uint256 size;
        assembly {
            size := extcodesize(account)
        }
        return size > 0;
    }

    function sendValue(address payable recipient, uint256 amount) internal {
        require(address(this).balance >= amount, "Address: insufficient balance");

        (bool success, ) = recipient.call{ value: amount }("");
        require(success, "Address: unable to send value, recipient may have reverted");
    }

    function functionCall(address target, bytes memory data) internal returns (bytes memory) {
        return functionCall(target, data, "Address: low-level call failed");
    }

    function functionCall(
        address target,
        bytes memory data,
        string memory errorMessage
    ) internal returns (bytes memory) {
        return functionCallWithValue(target, data, 0, errorMessage);
    }

    function functionCallWithValue(
        address target,
        bytes memory data,
        uint256 value
    ) internal returns (bytes memory) {
        return functionCallWithValue(target, data, value, "Address: low-level call with value failed");
    }

    function functionCallWithValue(
        address target,
        bytes memory data,
        uint256 value,
        string memory errorMessage
    ) internal returns (bytes memory) {
        require(address(this).balance >= value, "Address: insufficient balance for call");
        require(isContract(target), "Address: call to non-contract");

        (bool success, bytes memory returndata) = target.call{ value: value }(data);
        return verifyCallResult(success, returndata, errorMessage);
    }

    function functionStaticCall(address target, bytes memory data) internal view returns (bytes memory) {
        return functionStaticCall(target, data, "Address: low-level static call failed");
    }

    function functionStaticCall(
        address target,
        bytes memory data,
        string memory errorMessage
    ) internal view returns (bytes memory) {
        require(isContract(target), "Address: static call to non-contract");

        (bool success, bytes memory returndata) = target.staticcall(data);
        return verifyCallResult(success, returndata, errorMessage);
    }

    function functionDelegateCall(address target, bytes memory data) internal returns (bytes memory) {
        return functionDelegateCall(target, data, "Address: low-level delegate call failed");
    }

    function functionDelegateCall(
        address target,
        bytes memory data,
        string memory errorMessage
    ) internal returns (bytes memory) {
        require(isContract(target), "Address: delegate call to non-contract");

        (bool success, bytes memory returndata) = target.delegatecall(data);
        return verifyCallResult(success, returndata, errorMessage);
    }

    function verifyCallResult(
        bool success,
        bytes memory returndata,
        string memory errorMessage
    ) internal pure returns (bytes memory) {
        if (success) {
            return returndata;
        } else {
            // Look for revert reason and bubble it up if present
            if (returndata.length > 0) {
                // The easiest way to bubble the revert reason is using memory via assembly

                assembly {
                    let returndata_size := mload(returndata)
                    revert(add(32, returndata), returndata_size)
                }
            } else {
                revert(errorMessage);
            }
        }
    }
}


// File contracts/libraries/EnumerableSetUint.sol



library EnumerableSetUint {
    struct UintSet {
        uint256[] _values;
        mapping(uint256 => uint256) _indexes;
    }

    function add(UintSet storage set, uint256 value) internal returns (bool) {
        if (!contains(set, value)) {
            set._values.push(value);
            set._indexes[value] = set._values.length;
            return true;
        } else {
            return false;
        }
    }

    function remove(UintSet storage set, uint256 value) internal returns (bool) {
        uint256 valueIndex = set._indexes[value];
        if (valueIndex != 0) {
            uint256 toDeleteIndex = valueIndex - 1;
            uint256 lastIndex = set._values.length - 1;
            uint256 lastvalue = set._values[lastIndex];
            set._values[toDeleteIndex] = lastvalue;
            set._indexes[lastvalue] = toDeleteIndex + 1;
            set._values.pop();
            delete set._indexes[value];
            return true;
        } else {
            return false;
        }
    }

    function contains(UintSet storage set, uint256 value) internal view returns (bool) {
        return set._indexes[value] != 0;
    }

    function length(UintSet storage set) internal view returns (uint256) {
        return set._values.length;
    }

    function at(UintSet storage set, uint256 index) internal view returns (uint256) {
        require(set._values.length > index, "EnumerableSet: index out of bounds");
        return set._values[index];
    }

    function getAll(UintSet storage set) internal view returns (uint256[] memory) {
        return set._values;
    }

    function get(
        UintSet storage set,
        uint256 _page,
        uint256 _limit
    ) internal view returns (uint256[] memory) {
        require(_page > 0 && _limit > 0);
        uint256 tempLength = _limit;
        uint256 cursor = (_page - 1) * _limit;
        uint256 _uintLength = length(set);
        if (cursor >= _uintLength) {
            return new uint256[](0);
        }
        if (tempLength > _uintLength - cursor) {
            tempLength = _uintLength - cursor;
        }
        uint256[] memory uintList = new uint256[](tempLength);
        for (uint256 i = 0; i < tempLength; i++) {
            uintList[i] = at(set, cursor + i);
        }
        return uintList;
    }
}


// File contracts/libraries/EnumerableMap.sol



library EnumerableMap {
    struct MapEntry {
        bytes32 _key;
        bytes32 _value;
    }

    struct Map {
        MapEntry[] _entries;
        mapping(bytes32 => uint256) _indexes;
    }

    function _set(
        Map storage map,
        bytes32 key,
        bytes32 value
    ) private returns (bool) {
        // We read and store the key's index to prevent multiple reads from the same storage slot
        uint256 keyIndex = map._indexes[key];

        if (keyIndex == 0) {
            // Equivalent to !contains(map, key)
            map._entries.push(MapEntry({ _key: key, _value: value }));
            // The entry is stored at length-1, but we add 1 to all indexes
            // and use 0 as a sentinel value
            map._indexes[key] = map._entries.length;
            return true;
        } else {
            map._entries[keyIndex - 1]._value = value;
            return false;
        }
    }

    function _remove(Map storage map, bytes32 key) private returns (bool) {
        // We read and store the key's index to prevent multiple reads from the same storage slot
        uint256 keyIndex = map._indexes[key];

        if (keyIndex != 0) {
            // Equivalent to contains(map, key)
            // To delete a key-value pair from the _entries array in O(1), we swap the entry to delete with the last one
            // in the array, and then remove the last entry (sometimes called as 'swap and pop').
            // This modifies the order of the array, as noted in {at}.

            uint256 toDeleteIndex = keyIndex - 1;
            uint256 lastIndex = map._entries.length - 1;

            // When the entry to delete is the last one, the swap operation is unnecessary. However, since this occurs
            // so rarely, we still do the swap anyway to avoid the gas cost of adding an 'if' statement.

            MapEntry storage lastEntry = map._entries[lastIndex];

            // Move the last entry to the index where the entry to delete is
            map._entries[toDeleteIndex] = lastEntry;
            // Update the index for the moved entry
            map._indexes[lastEntry._key] = toDeleteIndex + 1; // All indexes are 1-based

            // Delete the slot where the moved entry was stored
            map._entries.pop();

            // Delete the index for the deleted slot
            delete map._indexes[key];

            return true;
        } else {
            return false;
        }
    }

    function _contains(Map storage map, bytes32 key) private view returns (bool) {
        return map._indexes[key] != 0;
    }

    function _length(Map storage map) private view returns (uint256) {
        return map._entries.length;
    }

    function _at(Map storage map, uint256 index) private view returns (bytes32, bytes32) {
        require(map._entries.length > index, "EnumerableMap: index out of bounds");

        MapEntry storage entry = map._entries[index];
        return (entry._key, entry._value);
    }

    function _tryGet(Map storage map, bytes32 key) private view returns (bool, bytes32) {
        uint256 keyIndex = map._indexes[key];
        if (keyIndex == 0) return (false, 0); // Equivalent to contains(map, key)
        return (true, map._entries[keyIndex - 1]._value); // All indexes are 1-based
    }

    function _get(Map storage map, bytes32 key) private view returns (bytes32) {
        uint256 keyIndex = map._indexes[key];
        require(keyIndex != 0, "EnumerableMap: nonexistent key"); // Equivalent to contains(map, key)
        return map._entries[keyIndex - 1]._value; // All indexes are 1-based
    }

    function _get(
        Map storage map,
        bytes32 key,
        string memory errorMessage
    ) private view returns (bytes32) {
        uint256 keyIndex = map._indexes[key];
        require(keyIndex != 0, errorMessage); // Equivalent to contains(map, key)
        return map._entries[keyIndex - 1]._value; // All indexes are 1-based
    }

    // UintToAddressMap

    struct UintToAddressMap {
        Map _inner;
    }

    function set(
        UintToAddressMap storage map,
        uint256 key,
        address value
    ) internal returns (bool) {
        return _set(map._inner, bytes32(key), bytes32(uint256(uint160(value))));
    }

    function remove(UintToAddressMap storage map, uint256 key) internal returns (bool) {
        return _remove(map._inner, bytes32(key));
    }

    function contains(UintToAddressMap storage map, uint256 key) internal view returns (bool) {
        return _contains(map._inner, bytes32(key));
    }

    function length(UintToAddressMap storage map) internal view returns (uint256) {
        return _length(map._inner);
    }

    function at(UintToAddressMap storage map, uint256 index) internal view returns (uint256, address) {
        (bytes32 key, bytes32 value) = _at(map._inner, index);
        return (uint256(key), address(uint160(uint256(value))));
    }

    function tryGet(UintToAddressMap storage map, uint256 key) internal view returns (bool, address) {
        (bool success, bytes32 value) = _tryGet(map._inner, bytes32(key));
        return (success, address(uint160(uint256(value))));
    }

    function get(UintToAddressMap storage map, uint256 key) internal view returns (address) {
        return address(uint160(uint256(_get(map._inner, bytes32(key)))));
    }

    function get(
        UintToAddressMap storage map,
        uint256 key,
        string memory errorMessage
    ) internal view returns (address) {
        return address(uint160(uint256(_get(map._inner, bytes32(key), errorMessage))));
    }
}


// File contracts/libraries/Strings.sol



library Strings {
    bytes16 private constant _HEX_SYMBOLS = "0123456789abcdef";

    function toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) {
            return "0";
        }
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }

    function toHexString(uint256 value) internal pure returns (string memory) {
        if (value == 0) {
            return "0x00";
        }
        uint256 temp = value;
        uint256 length = 0;
        while (temp != 0) {
            length++;
            temp >>= 8;
        }
        return toHexString(value, length);
    }

    function toHexString(uint256 value, uint256 length) internal pure returns (string memory) {
        bytes memory buffer = new bytes(2 * length + 2);
        buffer[0] = "0";
        buffer[1] = "x";
        for (uint256 i = 2 * length + 1; i > 1; --i) {
            buffer[i] = _HEX_SYMBOLS[value & 0xf];
            value >>= 4;
        }
        require(value == 0, "Strings: hex length insufficient");
        return string(buffer);
    }
}


// File contracts/token/KAP721.sol


contract KAP721 is KAP165, IKAP721, IKAP721V2, IKAP721Metadata, IKAP721Enumerable, AccessController, Pausable {
    using Address for address;
    using EnumerableSetUint for EnumerableSetUint.UintSet;
    using EnumerableMap for EnumerableMap.UintToAddressMap;
    using Strings for uint256;

    // Mapping from holder address to their (enumerable) set of owned tokens
    mapping(address => EnumerableSetUint.UintSet) _holderTokens;

    // Enumerable mapping from token ids to their owners
    EnumerableMap.UintToAddressMap private _tokenOwners;

    // Mapping from token ID to approved address
    mapping(uint256 => address) private _tokenApprovals;

    // Mapping from owner to operator approvals
    mapping(address => mapping(address => bool)) private _operatorApprovals;

    // Token name
    string public override name;

    // Token symbol
    string public override symbol;

    // Optional mapping for token URIs
    mapping(uint256 => string) private _tokenURIs;

    // Base URI
    string public baseURI;

    /*
     *     bytes4(keccak256('balanceOf(address)')) == 0x70a08231
     *     bytes4(keccak256('ownerOf(uint256)')) == 0x6352211e
     *     bytes4(keccak256('approve(address,uint256)')) == 0x095ea7b3
     *     bytes4(keccak256('getApproved(uint256)')) == 0x081812fc
     *     bytes4(keccak256('setApprovalForAll(address,bool)')) == 0xa22cb465
     *     bytes4(keccak256('isApprovedForAll(address,address)')) == 0xe985e9c5
     *     bytes4(keccak256('transferFrom(address,address,uint256)')) == 0x23b872dd
     *     bytes4(keccak256('safeTransferFrom(address,address,uint256)')) == 0x42842e0e
     *     bytes4(keccak256('safeTransferFrom(address,address,uint256,bytes)')) == 0xb88d4fde
     *
     *     => 0x70a08231 ^ 0x6352211e ^ 0x095ea7b3 ^ 0x081812fc ^
     *        0xa22cb465 ^ 0xe985e9c5 ^ 0x23b872dd ^ 0x42842e0e ^ 0xb88d4fde == 0x80ac58cd
     */
    bytes4 private constant _INTERFACE_ID_ERC721 = 0x80ac58cd;

    constructor(
        string memory _name,
        string memory _symbol,
        string memory _baseURI,
        string memory _projectName,
        address _kyc,
        address _adminProjectRouter,
        address _committee,
        address _transferRouter,
        uint256 _acceptedKYCLevel
    ) {
        name = _name;
        symbol = _symbol;
        baseURI = _baseURI;
        PROJECT = _projectName;
        kyc = IKYCBitkubChain(_kyc);
        adminProjectRouter = IAdminProjectRouter(_adminProjectRouter);
        committee = _committee;
        transferRouter = _transferRouter;
        acceptedKYCLevel = _acceptedKYCLevel;
    }

    function supportsInterface(bytes4 interfaceId) public view virtual override(KAP165, IKAP165) returns (bool) {
        return
            interfaceId == _INTERFACE_ID_ERC721 ||
            interfaceId == type(IKAP721).interfaceId ||
            interfaceId == type(IKAP721Metadata).interfaceId ||
            interfaceId == type(IKAP721Enumerable).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    function balanceOf(address owner) public view virtual override returns (uint256) {
        require(owner != address(0), "KAP721: balance query for the zero address");
        return _holderTokens[owner].length();
    }

    function ownerOf(uint256 tokenId) public view virtual override returns (address) {
        return _tokenOwners.get(tokenId, "KAP721: owner query for nonexistent token");
    }

    function tokenURI(uint256 tokenId) public view virtual override returns (string memory) {
        require(_exists(tokenId), "KAP721Metadata: URI query for nonexistent token");

        string memory _tokenURI = _tokenURIs[tokenId];
        string memory base = baseURI;

        // If there is no base URI, return the token URI.
        if (bytes(base).length == 0) {
            return _tokenURI;
        }
        // If both are set, concatenate the baseURI and tokenURI (via abi.encodePacked).
        if (bytes(_tokenURI).length > 0) {
            return string(abi.encodePacked(base, _tokenURI));
        }
        // If there is a baseURI but no tokenURI, concatenate the tokenID to the baseURI.
        return string(abi.encodePacked(base, tokenId.toString()));
    }

    function tokenOfOwnerByPage(
        address _owner,
        uint256 _page,
        uint256 _limit
    ) public view virtual override returns (uint256[] memory) {
        return _holderTokens[_owner].get(_page, _limit);
    }

    function tokenOfOwnerAll(address _owner) public view virtual override returns (uint256[] memory) {
        return _holderTokens[_owner].getAll();
    }

    function tokenOfOwnerByIndex(address owner, uint256 index) public view virtual override returns (uint256) {
        return _holderTokens[owner].at(index);
    }

    function totalSupply() public view virtual override returns (uint256) {
        // _tokenOwners are indexed by tokenIds, so .length() returns the number of tokenIds
        return _tokenOwners.length();
    }

    function tokenByIndex(uint256 index) public view virtual override returns (uint256) {
        (uint256 tokenId, ) = _tokenOwners.at(index);
        return tokenId;
    }

    function approve(address to, uint256 tokenId) public virtual override whenNotPaused {
        address owner = KAP721.ownerOf(tokenId);
        require(to != owner, "KAP721: approval to current owner");

        require(
            msg.sender == owner || isApprovedForAll(owner, msg.sender),
            "KAP721: approve caller is not owner nor approved for all"
        );

        _approve(to, tokenId);
    }

    function adminApprove(address to, uint256 tokenId) public virtual override onlySuperAdmin whenNotPaused {
        address owner = ownerOf(tokenId);
        require(to != owner, "KAP721: approval to current owner");

        require(
            kyc.kycsLevel(owner) >= acceptedKYCLevel && (to == address(0) || kyc.kycsLevel(to) >= acceptedKYCLevel),
            "KAP721: owner or to address is not a KYC user"
        );

        _approve(to, tokenId);
    }

    function getApproved(uint256 tokenId) public view virtual override returns (address) {
        require(_exists(tokenId), "KAP721: approved query for nonexistent token");

        return _tokenApprovals[tokenId];
    }

    function setApprovalForAll(address operator, bool approved) public virtual override whenNotPaused {
        require(operator != msg.sender, "KAP721: approve to caller");

        _setApprovalForAll(msg.sender, operator, approved);
    }

    function adminSetApprovalForAll(
        address owner,
        address operator,
        bool approved
    ) public virtual override onlySuperAdmin whenNotPaused {
        require(operator != owner, "KAP721: approve to caller");

        require(
            kyc.kycsLevel(owner) >= acceptedKYCLevel && kyc.kycsLevel(operator) >= acceptedKYCLevel,
            "KAP721: owner or operator address is not a KYC user"
        );

        _setApprovalForAll(owner, operator, approved);
    }

    function isApprovedForAll(address owner, address operator) public view virtual override returns (bool) {
        return _operatorApprovals[owner][operator];
    }

    function transferFrom(
        address from,
        address to,
        uint256 tokenId
    ) public virtual override whenNotPaused {
        require(_isApprovedOrOwner(msg.sender, tokenId), "KAP721: transfer caller is not owner nor approved");

        _transfer(from, to, tokenId);
    }

    function adminTransfer(
        address _from,
        address _to,
        uint256 _tokenId
    ) public virtual override onlyCommittee {
        if (isActivatedOnlyKYCAddress) {
            require(kyc.kycsLevel(_from) > 0 && kyc.kycsLevel(_to) > 0, "KAP721: only internal purpose");
        }
        require(ownerOf(_tokenId) == _from, "KAP721: transfer of token that is not own"); // internal owner

        // Clear approvals from the previous owner
        _approve(address(0), _tokenId);

        _holderTokens[_from].remove(_tokenId);
        _holderTokens[_to].add(_tokenId);

        _tokenOwners.set(_tokenId, _to);

        emit Transfer(_from, _to, _tokenId);
    }

    function internalTransfer(
        address sender,
        address recipient,
        uint256 tokenId
    ) external override onlySuperAdminOrTransferRouter whenNotPaused returns (bool) {
        require(
            kyc.kycsLevel(sender) >= acceptedKYCLevel && kyc.kycsLevel(recipient) >= acceptedKYCLevel,
            "KAP721: only internal purpose"
        );

        _transfer(sender, recipient, tokenId);
        return true;
    }

    function externalTransfer(
        address sender,
        address recipient,
        uint256 tokenId
    ) external override onlySuperAdminOrTransferRouter whenNotPaused returns (bool) {
        require(kyc.kycsLevel(sender) >= acceptedKYCLevel, "KAP721: only internal purpose");

        _transfer(sender, recipient, tokenId);
        return true;
    }

    function safeTransferFrom(
        address from,
        address to,
        uint256 tokenId
    ) public virtual override whenNotPaused {
        safeTransferFrom(from, to, tokenId, "");
    }

    function safeTransferFrom(
        address from,
        address to,
        uint256 tokenId,
        bytes memory _data
    ) public virtual override whenNotPaused {
        require(_isApprovedOrOwner(msg.sender, tokenId), "KAP721: transfer caller is not owner nor approved");
        _safeTransfer(from, to, tokenId, _data);
    }

    function _safeTransfer(
        address from,
        address to,
        uint256 tokenId,
        bytes memory _data
    ) internal virtual {
        _transfer(from, to, tokenId);
        require(_checkOnKAP721Received(from, to, tokenId, _data), "KAP721: transfer to non KAP721Receiver implementer");
    }

    function _exists(uint256 tokenId) internal view virtual returns (bool) {
        return _tokenOwners.contains(tokenId);
    }

    function _isApprovedOrOwner(address spender, uint256 tokenId) internal view virtual returns (bool) {
        require(_exists(tokenId), "KAP721: operator query for nonexistent token");
        address owner = KAP721.ownerOf(tokenId);
        return (spender == owner || getApproved(tokenId) == spender || isApprovedForAll(owner, spender));
    }

    function _safeMint(address to, uint256 tokenId) internal virtual {
        _safeMint(to, tokenId, "");
    }

    function _safeMint(
        address to,
        uint256 tokenId,
        bytes memory _data
    ) internal virtual {
        _mint(to, tokenId);
        require(
            _checkOnKAP721Received(address(0), to, tokenId, _data),
            "KAP721: transfer to non KAP721Receiver implementer"
        );
    }

    function _mint(address to, uint256 tokenId) internal virtual {
        require(to != address(0), "KAP721: mint to the zero address");
        require(!_exists(tokenId), "KAP721: token already minted");

        _beforeTokenTransfer(address(0), to, tokenId);

        _holderTokens[to].add(tokenId);

        _tokenOwners.set(tokenId, to);

        emit Transfer(address(0), to, tokenId);
    }

    function _burn(uint256 tokenId) internal virtual {
        address owner = ownerOf(tokenId); // internal owner

        _beforeTokenTransfer(owner, address(0), tokenId);

        // Clear approvals
        _approve(address(0), tokenId);

        _holderTokens[owner].remove(tokenId);
        _holderTokens[address(0)].add(tokenId);

        _tokenOwners.set(tokenId, address(0));

        emit Transfer(owner, address(0), tokenId);
    }

    function _transfer(
        address from,
        address to,
        uint256 tokenId
    ) internal virtual {
        require(KAP721.ownerOf(tokenId) == from, "KAP721: transfer of token that is not own");
        require(to != address(0), "KAP721: transfer to the zero address");

        _beforeTokenTransfer(from, to, tokenId);

        // Clear approvals from the previous owner
        _approve(address(0), tokenId);

        _holderTokens[from].remove(tokenId);
        _holderTokens[to].add(tokenId);

        _tokenOwners.set(tokenId, to);

        emit Transfer(from, to, tokenId);
    }

    function _setTokenURI(uint256 tokenId, string memory _tokenURI) internal virtual {
        require(_exists(tokenId), "KAP721Metadata: URI set of nonexistent token");
        _tokenURIs[tokenId] = _tokenURI;
    }

    function _setBaseURI(string memory baseURI_) internal virtual {
        baseURI = baseURI_;
    }

    function _checkOnKAP721Received(
        address from,
        address to,
        uint256 tokenId,
        bytes memory _data
    ) private returns (bool) {
        if (to.isContract()) {
            try IKAP721Receiver(to).onKAP721Received(msg.sender, from, tokenId, _data) returns (bytes4 retval) {
                return retval == IKAP721Receiver.onKAP721Received.selector;
            } catch (bytes memory reason) {
                if (reason.length == 0) {
                    revert("KAP721: transfer to non KAP721Receiver implementer");
                } else {
                    assembly {
                        revert(add(32, reason), mload(reason))
                    }
                }
            }
        } else {
            return true;
        }
    }

    function _approve(address to, uint256 tokenId) internal virtual {
        _tokenApprovals[tokenId] = to;
        emit Approval(KAP721.ownerOf(tokenId), to, tokenId);
    }

    function _setApprovalForAll(
        address owner,
        address operator,
        bool approved
    ) internal virtual {
        _operatorApprovals[owner][operator] = approved;
        emit ApprovalForAll(owner, operator, approved);
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId
    ) internal virtual {}
}


// File contracts/BitkubKAP721.sol


// KAP-20, KAP-721 Standard: V.1.0.0
// This KAP proposes an interface standard to create token contracts on Bitkub Chain.
// This Smart Contract does not provide the basic functionality, it only provides the required standard functions that define the implementation of APIs for KAP standard.
// This Smart Contract contains a set of operations that control how to communicate on the ecosystem of Bitkub applications on Bitkub Chain.

interface IJaothuiHistoryManager {
    function updateHistory(uint256 _tokenId, string memory _title, string memory _desc, bytes32 _data, string memory _dataType, address _by, address _contract) external;
}

contract JaothuiPedigreeKAP721 is KAP721 {
    event MintWithMetadata(address indexed operator, string _tokenURI, uint256 _tokenId);

    using EnumerableSetUint for EnumerableSetUint.UintSet;
    using Strings for uint256;

    modifier onlySuperAdminOrOwnerOrHolder(uint256 _tokenId) {
        require(
            adminProjectRouter.isSuperAdmin(msg.sender, PROJECT) ||
                msg.sender == owner() ||
                msg.sender == ownerOf(_tokenId),
            "BitkubKAP721: restricted only super admin or owner or holder"
        );
        _;
    }

    modifier onlyMinted(uint256 _tokenId) {
        require(exists(_tokenId), 'invalid tokenId');
        _;
    }

    struct URI {
        string image;
        string uri;
        uint256 createdAt;
        uint256 updatedAt;
    }

    mapping(uint256 => URI) public tokenIdToUri;
    mapping(address => bool) public blacklist;

    address history;

    uint256 currentTokenId = 0;

    constructor(
        address _kyc,
        address _adminProjectRouter,
        address _committee,
        address _transferRouter,
        address _history,
        uint256 _acceptedKycLevel
    )
        KAP721(
            "PEDIGREE",
            "PED",
            "",
            "jaothui-pedigree-nft",
            _kyc,
            _adminProjectRouter,
            _committee,
            _transferRouter,
            _acceptedKycLevel
        )
    {
        history = _history;
    }


    //GETTER
    ////////
    //@Dev: check if token existed
    function exists(uint256 _tokenId) public view returns (bool) {
        return _exists(_tokenId);
    }

    //@Dev: get current tokenId
    function getCurrentTokenId() public view returns(uint256) {
        return currentTokenId + 1;
    }

    //SETTER
    ////////
    //@Dev: set specific json URI and image URI to spcific tokenId
    function setTokenURI(uint256 _tokenId, string calldata _tokenUri, string calldata _imageUri) external onlyOwner {
        //@Dev : history update
        tokenIdToUri[_tokenId].uri = _tokenUri;
        tokenIdToUri[_tokenId].image = _imageUri;
        tokenIdToUri[_tokenId].createdAt = block.timestamp;
        tokenIdToUri[_tokenId].updatedAt = block.timestamp;

        _setTokenURI(_tokenId, _tokenUri);


        string memory hist = string(abi.encodePacked("set base uri to ", _tokenUri));
        IJaothuiHistoryManager(history).updateHistory(_tokenId, "setBaseUri", hist, bytes32(abi.encodePacked(_tokenUri)), "string", msg.sender, address(this));
    }

    function setTokenURIBatch(uint256[] memory _tokenIds, string[] memory _tokenUris, string[] memory _imageUris) external onlyOwner {
        for(uint256 i = 0; i < _tokenIds.length; ++i) {
            tokenIdToUri[_tokenIds[i]].uri = _tokenUris[i];
            tokenIdToUri[_tokenIds[i]].image = _imageUris[i];
            tokenIdToUri[_tokenIds[i]].createdAt = block.timestamp;
            tokenIdToUri[_tokenIds[i]].updatedAt = block.timestamp;
        }
    }

    function setHistory(address _history) external onlyOwner {
        history = _history;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function burn(uint256 _tokenId) external onlyOwner {
        _burn(_tokenId);
    }

    //@Dev: [MAIN] : mint certification to specific owner
    function mintWithMetadata(
        address _to,
        string memory _imageUri,
        string memory _tokenUri
    ) external onlyOwner whenNotPaused {
        uint256 tokenId = getCurrentTokenId(); 
        _mintWithMetadata(_to, _tokenUri, tokenId);    
        _increaseTokenId();

        tokenIdToUri[tokenId].uri = _tokenUri;
        tokenIdToUri[tokenId].image = _imageUri;
        tokenIdToUri[tokenId].createdAt = block.timestamp;

        emit MintWithMetadata(_to, _tokenUri, tokenId);
    }

    function mintWithMetadataBatch(address[] memory _wallets, string[] memory _imageUris, string[] memory _tokenUris) external onlyOwner whenNotPaused {
        require(_wallets.length == _imageUris.length, 'invalid length');

        for(uint256 i = 0; i < _wallets.length; i++) {
            uint256 tokenId = getCurrentTokenId();
            _mintWithMetadata(_wallets[i], _tokenUris[i], tokenId);
            _increaseTokenId();

            tokenIdToUri[tokenId].uri = _tokenUris[i];
            tokenIdToUri[tokenId].image = _imageUris[i];
            tokenIdToUri[tokenId].createdAt = block.timestamp;

            emit MintWithMetadata(_wallets[i], _tokenUris[i], tokenId);
        }
    }

    //Internal
    //////////
    function _increaseTokenId() internal {
        currentTokenId ++;
    }

    function _mintWithMetadata(
        address _to,
        string memory _tokenURI,
        uint256 _tokenId
    ) internal {
        _mint(_to, _tokenId);
        _setTokenURI(_tokenId, _tokenURI);
        if(history != address(0)) {
            string memory hist = string(abi.encodePacked('tokenId: ',_tokenId.toString(), ' minted to ', Strings.toHexString(uint160(_to), 20)));
            IJaothuiHistoryManager(history).updateHistory(_tokenId, "mint", hist, bytes32("0x00"), "string", msg.sender, address(this));
        }
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId
    ) internal virtual override {
        require(!blacklist[from], 'you are blacklisted');

        if(history != address(0)) {
            string memory hist = string(abi.encodePacked(Strings.toHexString(uint160(from), 20), ' send tokenId: ',tokenId.toString(), ' to ', Strings.toHexString(uint160(to), 20)));
            IJaothuiHistoryManager(history).updateHistory(tokenId, "transfer", hist, bytes32("0x00"), "string", from, address(this));
        }
    }
}

// KAP-20, KAP-721 Standard: V.1.0.0
// This KAP proposes an interface standard to create token contracts on Bitkub Chain.
// This Smart Contract does not provide the basic functionality, it only provides the required standard functions that define the implementation of APIs for KAP standard.
// This Smart Contract contains a set of operations that control how to communicate on the ecosystem of Bitkub applications on Bitkub Chain.