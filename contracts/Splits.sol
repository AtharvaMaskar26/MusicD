//SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "hardhat/console.sol";

///@title dMusic main contract
///@author https://github.com/AniDhumal
///@notice Songtokens are interpreted as ERC721 tokens. Each token may have multiple contributors with royalty splits specified
contract Splits is ERC721("dMusic", "DM"), ReentrancyGuard {
    using SafeMath for uint256;

    struct Split {
        address contributor;
        uint256 split;
    }
    address owner;
    mapping(uint256 => Split[]) public Contributors; //tokenId to Split
    mapping(string => bool) public artistExists;
    mapping(string => address) public artistNames;
    mapping(address => bool) public addressRegistered;
    mapping(uint256 => uint256) public tokenSplitTotal; //maps tokenid to the total percent assigned to it

    event songTokenCreated(string songname, string artistname, uint256 tokenId);
    event artistAdded(string artistname, address artistAddress);
    event ethTransferedForSplit(
        uint256 amount,
        address receiver,
        uint256 _tokenId
    );

    modifier ownedBy(uint256 _tokenId) {
        require(msg.sender == ownerOf(_tokenId));
        _;
    }
    modifier ownerContract() {
        require(msg.sender == owner, "Not an owner of the contract");
        _;
    }

    ///@return bool whether the address is already a contributor for the song or not
    ///@return uint256 the position of the contributor if present. Returns 0 if absent.
    function isAContributor(address _addy, uint256 _tokenId)
        private
        view
        returns (bool, uint256)
    {
        Split[] memory Conts = Contributors[_tokenId];
        for (uint256 i = 0; i <= Conts.length - 1; i++) {
            if (Conts[i].contributor == _addy) {
                return (true, i);
            }
        }
        return (false, 0);
    }

    constructor() {
        owner = msg.sender;
    }

    ///@param _contributor Address of the Contributor to be added
    ///@param _tokenId TokenId of the song
    ///@param _split Royalty split percent to be assigned to the contributor
    ///@dev Contributor needs to be registered first using addNewArtist()
    function addContributor(
        address _contributor,
        uint256 _tokenId,
        uint256 _split
    ) public ownedBy(_tokenId) {
        splitNotExceeding100(_tokenId, _split); //calls a view function and checks if splits are exceeding 100%
        (bool result, ) = isAContributor(_contributor, _tokenId);
        if (result == true) {
            revert("already a contributor");
        }
        Split memory newSplit;
        newSplit.contributor = _contributor;
        newSplit.split = _split;
        Contributors[_tokenId].push(newSplit);
        tokenSplitTotal[_tokenId] = tokenSplitTotal[_tokenId].add(_split);
    }

    ///@dev called only by function addContributor()
    function addToContributorSplit(
        address _contributor,
        uint256 _tokenId,
        uint256 _split,
        uint256 at2
    ) internal {
        require(_contributor == Contributors[_tokenId][at2].contributor);
        Contributors[_tokenId][at2].split =
            Contributors[_tokenId][at2].split +
            _split;
    }

    function subSplitFromSender(
        address _contributor,
        uint256 _tokenId,
        uint256 _split,
        uint256 at
    ) internal {
        require(_contributor == Contributors[_tokenId][at].contributor);
        Contributors[_tokenId][at].split =
            Contributors[_tokenId][at].split -
            _split;
    }

    function createSongToken(
        string calldata _songname,
        string calldata _artistname,
        uint256 _selfSplit
    ) external returns (uint256) {
        //could use chainlink oracle for generating random number but keccak is used here instead
        uint256 resultId = uint256(
            keccak256(abi.encodePacked(_songname, " ", _artistname))
        );
        require(_exists(resultId) == false);
        require(artistNames[_artistname] == msg.sender);
        _mint(msg.sender, resultId);

        //adding the artist as a 1st contributor
        Split memory ownerSplit;
        ownerSplit.contributor = msg.sender;
        ownerSplit.split = _selfSplit;
        Contributors[resultId].push(ownerSplit);
        tokenSplitTotal[resultId] = tokenSplitTotal[resultId].add(_selfSplit);

        emit songTokenCreated(_songname, _artistname, resultId);
        return resultId;
    }

    function addNewArtist(string memory _artistname) external {
        require(artistExists[_artistname] != true);
        require(addressRegistered[msg.sender] != true);
        artistNames[_artistname] = msg.sender;
        artistExists[_artistname] = true;
        addressRegistered[msg.sender] = true;
        emit artistAdded(_artistname, msg.sender);
    }

    ///@notice Checks if the split total exceeds 100%
    function splitNotExceeding100(uint256 _tokenId, uint256 _split)
        private
        view
    {
        require(
            tokenSplitTotal[_tokenId].add(_split) <= 100,
            "Split exceeds 100"
        );
    }

    ///@notice Payment Part of the contract
    ///@dev Done in the same contract because solidity can't return dynamic arrays yet
    ///@dev Contract cut can be ignored if the dev wishes for it to be non-profit
    ///@dev Requires manually calling this function but calls can be automated on monthly basis. Would work better imo
    function splitMonthlyRevenue(uint256 _tokenId)
        public
        payable
        ownedBy(_tokenId)
        nonReentrant
    {
        //sends ether in msg.value
        Split[] memory cont = Contributors[_tokenId];
        uint256 val = msg.value; // to avoid msg.value in a loop
        uint256 totalContractCut = 0;
        for (uint256 i = 0; i <= cont.length - 1; i++) {
            uint256 amount = val.mul(cont[i].split).div(100); //use safe math
            uint256 contractCut = amount.div(2000); //2% fee
            totalContractCut = totalContractCut + contractCut;
            amount = amount.sub(contractCut);
            address receiver = cont[i].contributor;
            payable(receiver).transfer(amount);
            emit ethTransferedForSplit(amount, receiver, _tokenId);
        }
    }

    ///@notice Transfers the ownership of the token with the split owned by the owner
    function transferToken(
        address _from,
        address _to,
        uint256 _tokenId
    ) public ownedBy(_tokenId) {
        Split[] memory cont = Contributors[_tokenId];
        (, uint256 at) = isAContributor(_from, _tokenId);
        transferSplits(_from, _to, _tokenId, cont[at].split);
        _safeTransferFrom(_from, _to, _tokenId, "");
    }

    function transferSplits(
        address _from,
        address _to,
        uint256 _tokenId,
        uint256 _percentOfWhole
    ) public {
        bool fromIsACont;
        bool toIsACont;
        uint256 at;
        uint256 at2;
        require(_from == msg.sender, "Not authorised to transfer splits");
        (fromIsACont, at) = isAContributor(_from, _tokenId);
        require(fromIsACont, "Not a Verified Contributor");
        (toIsACont, at2) = isAContributor(_to, _tokenId);
        if (toIsACont == false) {
            Split[] memory cont = Contributors[_tokenId];
            require(_percentOfWhole <= cont[at].split);
            cont[at].split = cont[at].split.sub(_percentOfWhole);
            addContributor(_to, _tokenId, _percentOfWhole);
        } else {
            addToContributorSplit(_to, _tokenId, _percentOfWhole, at2);
        }
        subSplitFromSender(_from, _tokenId, _percentOfWhole, at);
    }

    ///@notice For the contract owner to cash out the funds collected by the contract
    ///@dev Implementation can be completely ignored but will require modifying the logic of splitMonthlyRevenue()
    function cashOut() external payable ownerContract {
        payable(owner).transfer(address(this).balance);
    }

    ///@notice getter function to get list of contributors
    ///@return arrContributors array of contributors for the specific song token
    function getContributors(uint256 _tokenId)
        external
        view
        returns (address[] memory)
    {
        Split[] memory cont = Contributors[_tokenId];
        address[] memory arrContributors = new address[](cont.length);
        for (uint256 i = 0; i < cont.length; i++) {
            arrContributors[i] = (cont[i].contributor);
        }
        return arrContributors;
    }
}
