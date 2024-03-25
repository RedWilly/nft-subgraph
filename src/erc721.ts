import { ERC721, Listing } from "../generated/schema";
import { Transfer, ERC721 as ERC721Contract } from "../generated/ERC721/ERC721";
// import { jsonToString, parseTokenURI } from "./parsing";
import { handleCollection } from "./collection";
import { store } from "@graphprotocol/graph-ts";


// @todo Add collection schema and create a collection for each contract

export function handleTransfer(event: Transfer): void {
  const tokenId = event.params.tokenId;
  const tokenAddress = event.address;
  const contract = ERC721Contract.bind(tokenAddress);
  const id = `${tokenAddress.toHex()}-${tokenId}`;
  let token = ERC721.load(id);
  if (token === null) {
    token = new ERC721(id);
    token.tokenId = tokenId;
    token.address = tokenAddress;
    const collection = handleCollection(tokenAddress, contract);
    token.name = collection.name;
    token.symbol = collection.symbol;
  }
  token.owner = event.params.to;

  token.save();
}
