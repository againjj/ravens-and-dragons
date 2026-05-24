import type { Card } from "./gin-rummy-types";
import { suitSymbol } from "./gin-rummy-rules";
export const CardView = ({ card }: { card: Card }) => (
    <div className={`gin-card ${card.suit === "hearts" || card.suit === "diamonds" ? "is-red" : "is-black"}`}>
        <span>{card.rank}</span>
        <strong>{suitSymbol(card.suit)}</strong>
        <span>{card.rank}</span>
    </div>
);

