import type { Card, Suit } from "./gin-rummy-types";
const suits: Suit[] = ["clubs", "diamonds", "hearts", "spades"];
const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
export const deckById = new Map(suits.flatMap((suit) => ranks.map((rank) => [rank + "_" + suit, { id: rank + "_" + suit, rank, suit } as Card])));

