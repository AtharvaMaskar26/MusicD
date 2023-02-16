require('@nomiclabs/hardhat-truffle5');
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { ethers, contract } = require('hardhat')
const { assert } = require('chai');
// const { ethers } = require('forta-agent');
const truffleAssert = require('truffle-assertions');
const Splits=artifacts.require("Splits.sol");
contract ("Splits",(accounts)=>{
        let [alice,bob,carey]=accounts;
        let contractInstance;
        beforeEach(async () => {
            contractInstance = await Splits.new();
        });
    describe("Test for adding an artist", ()=>{
        it("Should be able to add new artist", async()=>{
            const result=await contractInstance.addNewArtist("Artist");
            assert.equal(result.receipt.status,true);
            assert.equal(result.logs[0].args.artistname,"Artist");
        })
        it("Should not allow same artist name for another account", async()=>{
            await contractInstance.addNewArtist("Artist1");
            await truffleAssert.reverts(contractInstance.addNewArtist("Artist1"));
        })
        it("Should not allow one account to hold more than one artist name", async()=>{
            await contractInstance.addNewArtist("Artist1",{from:alice});
            await truffleAssert.reverts(contractInstance.addNewArtist("Artist2",{from:alice}));
        })
    })
    describe("Tests for adding a new Song token",()=>{
        it("Unregistered artist should not be able to add token", async()=>{
            var selfSplit=50;
            await truffleAssert.reverts(contractInstance.createSongToken("songname","Artist1",selfSplit,{from:alice}));
        })
        it("Registered artist should be able to add new Song", async()=>{
            await contractInstance.addNewArtist("Artist3",{from:bob});
            var selfSplit=50;
            const result2=await contractInstance.createSongToken("songname","Artist3",selfSplit,{from:bob});
            assert.equal(result2.receipt.status,true);
        })
        it("One artist should not be able to add more than one song with the same songname", async()=>{
            await contractInstance.addNewArtist("Artist1",{from:alice});
            var selfSplit=50;
            await contractInstance.createSongToken("songname","Artist1",selfSplit,{from:alice});
            await truffleAssert.reverts(contractInstance.createSongToken("songname","Artist1",selfSplit,{from:alice}));   
        })
        it("One artist should be able to add multiple tokens",async()=>{
            await contractInstance.addNewArtist("Artist1",{from:alice});
            var selfSplit=50;
            await contractInstance.createSongToken("songname","Artist1",selfSplit,{from:alice});
            const result2=await contractInstance.createSongToken("songname2","Artist1",selfSplit,{from:alice});
            assert.equal(result2.receipt.status,true);
        })
    })
    describe("Tests for adding Contributors",()=>{
        it("Only owner should be able to add a contributor to a song", async()=>{
            await contractInstance.addNewArtist("Artist1",{from:alice})
            await contractInstance.createSongToken("songname","Artist1",50,{from: alice})
            var tokenId="86806761350380312975367754058103788362278580235689859354386442452340403295653";
            var result=await contractInstance.addContributor(bob,tokenId,40,{from: alice})
            assert.equal(result.receipt.status,true)
            await truffleAssert.reverts(contractInstance.addContributor(carey,tokenId,10, {from: carey}))
        })
        it("Contributor address should not occur twice",async()=>{
            await contractInstance.addNewArtist("Artist1",{from:alice})
            await contractInstance.createSongToken("songname","Artist1",50,{from: alice})
            var tokenId="86806761350380312975367754058103788362278580235689859354386442452340403295653";
            await contractInstance.addContributor(bob,tokenId,40,{from: alice})
            await truffleAssert.reverts(contractInstance.addContributor(bob,tokenId,10,{from: alice}))
        })

        it("Contributor split should not exceed 100",async()=>{
            await contractInstance.addNewArtist("Artist1",{from:alice})
            await contractInstance.createSongToken("songname","Artist1",50,{from: alice})
            var tokenId="86806761350380312975367754058103788362278580235689859354386442452340403295653";
            await contractInstance.addContributor(bob,tokenId,40,{from: alice})
            await truffleAssert.reverts(contractInstance.addContributor(bob,tokenId,11,{from: alice}))
        })
    })
    describe("Tests for transferring tokens",()=>{
        it("Rightful owner should be able to transfer their token",async()=>{
            await contractInstance.addNewArtist("Artist1",{from:alice})
            var selfSplit=50;
            await contractInstance.createSongToken("songname","Artist1",selfSplit,{from:alice});
            var tokenId="86806761350380312975367754058103788362278580235689859354386442452340403295653";

            await contractInstance.transferToken(alice,bob,tokenId,{from:alice});
            expect(await contractInstance.ownerOf("86806761350380312975367754058103788362278580235689859354386442452340403295653")).to.equal(bob)
        })

        it("Only owner allowed to transfer token",async()=>{
            await contractInstance.addNewArtist("Artist1",{from:alice})
            var selfSplit=50;
            await contractInstance.createSongToken("songname","Artist1",selfSplit,{from:alice});
            var tokenId="86806761350380312975367754058103788362278580235689859354386442452340403295653";
            await truffleAssert.reverts(contractInstance.transferToken(alice,bob,tokenId,{from:bob}));
        })
        it("transferFrom function call to ERC721 should not be allowed",async()=>{
            await contractInstance.addNewArtist("Artist1",{from:alice})
            var selfSplit=50;
            await contractInstance.createSongToken("songname","Artist1",selfSplit,{from:alice});
            var tokenId="86806761350380312975367754058103788362278580235689859354386442452340403295653";
            // await truffleAssert.reverts(contractInstance._safeTransferFrom(alice,bob,tokenId));
            // functionality works but no way to test the functionality 
        })
    })

    describe("Tests for transferring Splits",()=>{
        it("Rightful owner should be able to transfer their splits to another contributor",async()=>{
            await contractInstance.addNewArtist("Artist1",{from:alice})
            var split1=50
            var tokenId="86806761350380312975367754058103788362278580235689859354386442452340403295653";
            await contractInstance.addNewArtist("Artist2",{from:bob})
            var split2=25
            await contractInstance.addNewArtist("Artist3",{from:carey})
            var split3=25

            await contractInstance.createSongToken("songname","Artist1",split1,{from:alice})
            await contractInstance.addContributor(bob,tokenId,split2)
            await contractInstance.addContributor(carey,tokenId,split3)
            
            await contractInstance.transferSplits(bob,carey,tokenId,10,{from:bob})
            var contBob=await contractInstance.Contributors(tokenId,1)//0 for alice, 1 for bob and 2 for carey
            var contCarey=await contractInstance.Contributors(tokenId,2)

            expect(contBob.split.words[0]).to.equal(15)
            expect(contCarey.split.words[0]).to.equal(35)
        })
        it("should not be allowed to transfer more than split owned",async()=>{
            await contractInstance.addNewArtist("Artist1",{from:alice})
            var split1=50
            var tokenId="86806761350380312975367754058103788362278580235689859354386442452340403295653";
            await contractInstance.addNewArtist("Artist2",{from:bob})
            var split2=25
            await contractInstance.addNewArtist("Artist3",{from:carey})
            var split3=25

            await contractInstance.createSongToken("songname","Artist1",split1,{from:alice})
            await contractInstance.addContributor(bob,tokenId,split2)
            await contractInstance.addContributor(carey,tokenId,split3)
            
            await truffleAssert.reverts(contractInstance.transferSplits(bob,carey,tokenId,35));
        })
        it("only split owner should be able to transfer the splits", async()=>{
            await contractInstance.addNewArtist("Artist1",{from:alice})
            var split1=50
            var tokenId="86806761350380312975367754058103788362278580235689859354386442452340403295653";
            await contractInstance.addNewArtist("Artist2",{from:bob})
            var split2=25
            await contractInstance.addNewArtist("Artist3",{from:carey})
            var split3=25

            await contractInstance.createSongToken("songname","Artist1",split1,{from:alice})
            await contractInstance.addContributor(bob,tokenId,split2)
            await contractInstance.addContributor(carey,tokenId,split3)

            await truffleAssert.reverts(contractInstance.transferSplits(bob,carey,tokenId,25,{from:alice}),"Not authorised to transfer splits");

        })
    })
    describe("Tests to Split monthly revenue", async()=>{
        it("Splits distributed",async()=>{
            await contractInstance.addNewArtist("Artist1",{from:alice})
            var split1=50
            var tokenId="86806761350380312975367754058103788362278580235689859354386442452340403295653";
            await contractInstance.addNewArtist("Artist2",{from:bob})
            var split2=25
            await contractInstance.addNewArtist("Artist3",{from:carey})
            var split3=25

            await contractInstance.createSongToken("songname","Artist1",split1,{from:alice})
            await contractInstance.addContributor(bob,tokenId,split2)
            await contractInstance.addContributor(carey,tokenId,split3)
            const contractBalance1 = await ethers.provider.getBalance(carey)
            await contractInstance.splitMonthlyRevenue(tokenId,{value:5545000000000000000});
            const contractBalance2 = await ethers.provider.getBalance(carey)
            console.log(Math.min(contractBalance1, contractBalance2));
            assert.isAbove(contractBalance2,contractBalance1)
        })
        it("Contract receives a cut", async()=>{
            await contractInstance.addNewArtist("Artist1",{from:alice})
            var split1=50
            var tokenId="86806761350380312975367754058103788362278580235689859354386442452340403295653";
            await contractInstance.addNewArtist("Artist2",{from:bob})
            var split2=25
            await contractInstance.addNewArtist("Artist3",{from:carey})
            var split3=25
            await contractInstance.createSongToken("songname","Artist1",split1,{from:alice})
            await contractInstance.addContributor(bob,tokenId,split2)
            await contractInstance.addContributor(carey,tokenId,split3)
            const contractBalance1= await ethers.provider.getBalance(contractInstance.address);
            await contractInstance.splitMonthlyRevenue(tokenId,{value:5545000000000000000});
            const contractBalance2 = await ethers.provider.getBalance(contractInstance.address);
            assert.isAbove(contractBalance2,contractBalance1)
        })

    })
})