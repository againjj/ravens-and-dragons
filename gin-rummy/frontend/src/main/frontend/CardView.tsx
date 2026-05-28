import type { Card } from "./gin-rummy-types";
import { suitSymbol } from "./gin-rummy-rules";
export const CardView = ({ card }: { card: Card }) => (
    <div className={`gin-card ${card.suit === "hearts" || card.suit === "diamonds" ? "is-red" : "is-black"}`}>
        <span className="gin-card-corner gin-card-corner-top">
            <span>{card.rank}</span>
            <span>{suitSymbol(card.suit)}</span>
        </span>
        <strong>{suitSymbol(card.suit)}</strong>
        <span className="gin-card-corner gin-card-corner-bottom">
            <span>{card.rank}</span>
            <span>{suitSymbol(card.suit)}</span>
        </span>
    </div>
);
