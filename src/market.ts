import { BigInt, store, Bytes } from "@graphprotocol/graph-ts";
import {
  NFTKEYMarketplaceV2,
  TokenListed,
  TokenDelisted,
  TokenBought,
  TokenBidEntered,
  TokenBidWithdrawn,
  TokenBidAccepted,
} from "../generated/NFTKEYMarketplaceV2/NFTKEYMarketplaceV2";
import { Listing, Sale, Bid, CollectionStat } from "../generated/schema";

export function handleTokenListed(event: TokenListed): void {
  let id =
    event.params.erc721Address.toHexString() +
    "-" +
    event.params.tokenId.toString();

  let listing = Listing.load(id);
  if (listing == null) {
    listing = new Listing(id);
  }

  listing.tokenId = event.params.tokenId;
  listing.erc721Address = event.params.erc721Address;
  listing.seller = event.params.listing.seller;
  listing.price = event.params.listing.value;
  listing.expireTimestamp = event.params.listing.expireTimestamp;
  listing.listedTimestamp = event.block.timestamp;
  listing.status = "Active";

  listing.save();
  updateFloorPrice(event.params.erc721Address);
}

export function handleTokenDelisted(event: TokenDelisted): void {
  let id =
    event.params.erc721Address.toHexString() +
    "-" +
    event.params.tokenId.toString();
  store.remove("Listing", id);
}

export function handleTokenBought(event: TokenBought): void {
  let id = event.transaction.hash.toHex() + "-" + event.logIndex.toString();
  let sale = new Sale(id);
  sale.erc721Address = event.params.erc721Address;
  sale.tokenId = event.params.tokenId;
  sale.buyer = event.params.buyer;
  sale.seller = event.params.listing.seller;
  sale.price = event.params.listing.value;
  sale.serviceFee = event.params.serviceFee;
  sale.royaltyFee = event.params.royaltyFee;
  sale.timestamp = event.block.timestamp;
  sale.status = "Sold";
  sale.txid = event.transaction.hash.toHex(); // Store the transaction hash as txid
  sale.save();

  let listingId =
    event.params.erc721Address.toHexString() +
    "-" +
    event.params.tokenId.toString();

  store.remove("Listing", listingId);

  // Update total volume traded for the collection
  let statsId = event.params.erc721Address.toHexString();
  let collectionStat = CollectionStat.load(statsId);
  if (collectionStat == null) {
    collectionStat = new CollectionStat(statsId);
    collectionStat.floorPrice = BigInt.fromI32(0);
    collectionStat.totalVolumeTraded = BigInt.fromI32(0);
     // Initialize totalVolumeTradedWETH with a default value if it's the first time
    collectionStat.totalVolumeTradedWETH = BigInt.fromI32(0);
  }
  collectionStat.totalVolumeTraded = collectionStat.totalVolumeTraded.plus(
    event.params.listing.value
  );
  collectionStat.save();

  // Check and potentially update the floor price
  updateFloorPrice(event.params.erc721Address);
}

export function handleTokenBidEntered(event: TokenBidEntered): void {
  let id =
    event.params.erc721Address.toHexString() +
    "-" +
    event.params.tokenId.toString() +
    "-" +
    event.params.bid.bidder.toHexString();
  let bid = Bid.load(id);
  if (bid == null) {
    bid = new Bid(id);
  }

  // Accessing nested 'bid' properties
  bid.erc721Address = event.params.erc721Address;
  bid.tokenId = event.params.bid.tokenId; // Accessing the nested tokenId
  bid.bidder = event.params.bid.bidder; // Accessing the nested bidder
  bid.value = event.params.bid.value; // Accessing the nested value
  bid.expireTimestamp = event.params.bid.expireTimestamp; // Accessing the nested expireTimestamp
  bid.status = "Active"; // Assuming you want to set the status when bid is entered
  bid.save();
}

export function handleTokenBidWithdrawn(event: TokenBidWithdrawn): void {
  let id =
    event.params.erc721Address.toHexString() +
    "-" +
    event.params.tokenId.toString() +
    "-" +
    event.params.bid.bidder.toHexString();

  store.remove("Bid", id);
}

export function handleTokenBidAccepted(event: TokenBidAccepted): void {
  // Create or update a Sale entity
  let saleId = event.transaction.hash.toHex() + "-" + event.logIndex.toString();
  let sale = new Sale(saleId);
  sale.erc721Address = event.params.erc721Address;
  sale.tokenId = event.params.tokenId;
  sale.buyer = event.params.bid.bidder; // Buyer is the bidder
  sale.seller = event.params.seller;
  sale.price = event.params.bid.value;
  sale.serviceFee = event.params.serviceFee;
  sale.royaltyFee = event.params.royaltyFee;
  sale.timestamp = event.block.timestamp;
  sale.status = "Sold"; // Ensure status is set for every Sale entity
  sale.txid = event.transaction.hash.toHex(); // Store the transaction hash as txid
  sale.save();

  // Correctly identify the listing to be removed using only erc721Address and tokenId
  let listingId =
    event.params.erc721Address.toHexString() +
    "-" +
    event.params.tokenId.toString();

  // Now, this ID matches the one used when the listing was created
  store.remove("Listing", listingId);

  // Update the Bid status to Sold using the bid's unique ID
  let bidId =
    event.params.erc721Address.toHexString() +
    "-" +
    event.params.tokenId.toString() +
    "-" +
    event.params.bid.bidder.toHexString();
  // let bid = Bid.load(bidId);
  // if (bid) {
  //   bid.status = "Sold";
  //   bid.save();
  // }
  store.remove("Bid", bidId);

  // Update total volume traded for the collection
  let statsId = event.params.erc721Address.toHexString();
  let collectionStat = CollectionStat.load(statsId);
  if (collectionStat == null) {
    collectionStat = new CollectionStat(statsId);
    collectionStat.floorPrice = BigInt.fromI32(0);
    collectionStat.totalVolumeTraded = BigInt.fromI32(0);
  }
  collectionStat.totalVolumeTradedWETH = collectionStat.totalVolumeTradedWETH.plus(
    event.params.bid.value
  );
  collectionStat.save();

  // Update the floor price - dynamics
  updateFloorPrice(event.params.erc721Address);
}


function updateFloorPrice(erc721Address: Bytes): void {
  let statsId = erc721Address.toHexString();
  let collectionStat = CollectionStat.load(statsId);
  if (collectionStat == null) {
    collectionStat = new CollectionStat(statsId);
    collectionStat.floorPrice = BigInt.fromI32(0);
    collectionStat.totalVolumeTraded = BigInt.fromI32(0);
    collectionStat.totalVolumeTradedWETH = BigInt.fromI32(0);
    collectionStat.save();
  }
}