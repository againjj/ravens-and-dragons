import { Fragment, type CSSProperties, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { portalRoot } from "./lunar-base-constants";
import { lunarBaseColors, type CardRotation, type LunarBaseCard, type LunarBaseColorName } from "./lunar-base-types";

type ActionTooltipCorner = "bottomRight" | "bottomLeft" | "topRight" | "topLeft";

const cardTintColor = (card: LunarBaseCard | null): string | null => {
    if (!card) return null;
    if (card.type === "station" || card.type === "agent") return lunarBaseColors.gray.tint;
    if (card.type === "influence") return lunarBaseColors.orange.tint;
    return lunarBaseColors[card.color ?? "gray"].tint;
};

const cardDisplayName = (card: LunarBaseCard): string =>
    card.type === "station" && card.flipped
        ? card.stationBackName ?? card.name ?? card.type
        : card.type === "station"
            ? card.stationFrontName ?? card.name ?? card.type
            : card.name ?? card.type;

const cardDisplayOrbs = (card: LunarBaseCard): LunarBaseColorName[] =>
    card.type === "station" && card.flipped
        ? card.stationBackOrbs ?? []
        : card.type === "station"
            ? card.stationFrontOrbs ?? []
            : card.orbs ?? [];

const cardDisplayColonists = (card: LunarBaseCard): number =>
    card.type === "station" && card.flipped
        ? card.stationBackColonists ?? card.colonists ?? 0
        : card.type === "station"
            ? card.stationFrontColonists ?? 0
            : card.colonists ?? 0;

const cardDisplayAchievements = (card: LunarBaseCard): number[] =>
    card.type === "station" && card.flipped
        ? card.stationBackAchievements ?? card.achievements ?? []
        : card.type === "station"
            ? card.stationFrontAchievements ?? []
            : card.achievements ?? [];

const cardDisplayAction = (card: LunarBaseCard): { label: "MAIN ACTION" | "ON PLAYING" | "EFFECT"; text: string } | null => {
    const mainActionText = card.type === "station" && card.flipped
        ? card.stationBackMainActionText ?? card.mainActionText
        : card.type === "station"
            ? card.stationFrontMainActionText ?? card.mainActionText
            : card.mainActionText;
    if (mainActionText) return { label: "MAIN ACTION", text: mainActionText };
    if (card.onPlayingText) return { label: "ON PLAYING", text: card.onPlayingText };
    if (card.effectText) return { label: "EFFECT", text: card.effectText };
    return null;
};

const costRows = (cost: LunarBaseColorName[]): LunarBaseColorName[][] => {
    if (cost.length === 0) return [];
    const firstRowCount = Math.min(cost.length, cost.length <= 4 ? 2 : 3);
    const rows = [cost.slice(0, firstRowCount)];
    for (let index = firstRowCount; index < cost.length; index += 3) {
        rows.push(cost.slice(index, index + 3));
    }
    return rows;
};

const blackCircledNumbers = ["", "❶", "❷", "❸", "❹", "❺", "❻", "❼", "❽", "❾", "❿", "⓫", "⓬", "⓭", "⓮", "⓯", "⓰", "⓱", "⓲", "⓳", "⓴"];

const achievementGlyph = (achievement: number): string =>
    blackCircledNumbers[achievement] ?? String(achievement);

export const CardView = ({
    card,
    faceDown = false,
    selected = false,
    rotation = 0,
    visualRotation = rotation,
    empty = false,
    instantRotation = false,
    className = ""
}: {
    card: LunarBaseCard | null;
    faceDown?: boolean;
    selected?: boolean;
    rotation?: CardRotation;
    visualRotation?: number;
    empty?: boolean;
    instantRotation?: boolean;
    className?: string;
}) => (
    <div className={[
        "lunar-card",
        faceDown ? "is-back" : "",
        selected ? "is-selected" : "",
        empty ? "is-empty" : "",
        instantRotation ? "is-rotation-instant" : "",
        className
    ].filter(Boolean).join(" ")} style={{
        "--lunar-card-rotation": `${visualRotation}deg`,
        "--lunar-card-tint": cardTintColor(card) ?? undefined
    } as CSSProperties}>
        {faceDown || empty || !card ? null : (
            <>
                <CardCostView card={card} />
                <ConnectorsView card={card} />
                <span className="lunar-card-name">{cardDisplayName(card)}</span>
                <span className="lunar-card-type">{card.type}</span>
                <OrbsView card={card} />
                <CardActionView card={card} />
                <CardDepictionsView card={card} />
            </>
        )}
    </div>
);

const CardCostView = ({ card }: { card: LunarBaseCard }) => {
    const cost = (card.cardCost ?? []).filter((color) => color in lunarBaseColors);
    const rows = costRows(cost);
    if (rows.length === 0) return null;
    return (
        <span className="lunar-card-cost" aria-label={`Cost: ${cost.join(", ")}`}>
            {rows.map((row, rowIndex) => (
                <span key={rowIndex} className="lunar-card-cost-row">
                    {row.map((color, index) => (
                        <span
                            key={`${color}-${rowIndex}-${index}`}
                            className="lunar-card-cost-pip"
                            style={{ "--lunar-card-cost-color": lunarBaseColors[color].css } as CSSProperties}
                            aria-hidden="true"
                        />
                    ))}
                </span>
            ))}
        </span>
    );
};

const ConnectorsView = ({ card }: { card: LunarBaseCard }) => (
    <>
        {(["top", "topLeft", "topRight", "bottomLeft", "bottomRight", "bottom"] as const).map((position) => {
            const color = card.connectors?.[position];
            if (!color || !(color in lunarBaseColors)) return null;
            return (
                <span
                    key={position}
                    className={`lunar-connector ${position}`}
                    style={{ "--lunar-connector-color": lunarBaseColors[color].css } as CSSProperties}
                    aria-hidden="true"
                />
            );
        })}
    </>
);

const OrbsView = ({ card }: { card: LunarBaseCard }) => {
    const orbs = cardDisplayOrbs(card).filter((color) => color in lunarBaseColors);
    if (orbs.length === 0) return null;
    return (
        <span className="lunar-card-orbs" aria-label={`Orbs: ${orbs.join(", ")}`}>
            {orbs.map((color, index) => (
                <span
                    key={`${color}-${index}`}
                    className="lunar-card-orb"
                    style={{ "--lunar-card-orb-color": lunarBaseColors[color].css } as CSSProperties}
                    aria-hidden="true"
                />
            ))}
        </span>
    );
};

const actionTooltipCorners: ActionTooltipCorner[] = ["bottomRight", "bottomLeft", "topRight", "topLeft"];

const actionTooltipPosition = (
    mouse: { x: number; y: number },
    size: { width: number; height: number },
    corner: ActionTooltipCorner
) => {
    switch (corner) {
        case "bottomRight":
            return { left: mouse.x, top: mouse.y };
        case "bottomLeft":
            return { left: mouse.x - size.width, top: mouse.y };
        case "topRight":
            return { left: mouse.x, top: mouse.y - size.height };
        case "topLeft":
            return { left: mouse.x - size.width, top: mouse.y - size.height };
    }
};

const actionTooltipFits = (
    mouse: { x: number; y: number },
    size: { width: number; height: number },
    corner: ActionTooltipCorner
): boolean => {
    const position = actionTooltipPosition(mouse, size, corner);
    const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
    const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
    return position.left >= 0 &&
        position.top >= 0 &&
        position.left + size.width <= viewportWidth &&
        position.top + size.height <= viewportHeight;
};

const bestActionTooltipCorner = (
    mouse: { x: number; y: number },
    size: { width: number; height: number },
    current: ActionTooltipCorner
): ActionTooltipCorner => {
    if (actionTooltipFits(mouse, size, current)) return current;
    return actionTooltipCorners.find((corner) => actionTooltipFits(mouse, size, corner)) ?? "bottomRight";
};

const ActionTooltipText = ({ text }: { text: string }) => (
    <span className="lunar-card-action-tooltip-text">
        {text.split("\n").map((line, index) => (
            <Fragment key={index}>
                {index > 0 ? <br /> : null}
                <span className="lunar-card-action-tooltip-line">{line}</span>
            </Fragment>
        ))}
    </span>
);

const CardActionView = ({ card }: { card: LunarBaseCard }) => {
    const action = cardDisplayAction(card);
    const tooltipRef = useRef<HTMLDivElement | null>(null);
    const [tooltip, setTooltip] = useState<{
        mouse: { x: number; y: number };
        corner: ActionTooltipCorner;
    } | null>(null);

    useLayoutEffect(() => {
        if (!tooltip || !tooltipRef.current) return;
        const rect = tooltipRef.current.getBoundingClientRect();
        const nextCorner = bestActionTooltipCorner(tooltip.mouse, { width: rect.width, height: rect.height }, tooltip.corner);
        if (nextCorner !== tooltip.corner) {
            setTooltip({ ...tooltip, corner: nextCorner });
        }
    }, [tooltip]);

    if (!action) return null;

    const tooltipPosition = tooltip
        ? actionTooltipPosition(
            tooltip.mouse,
            {
                width: tooltipRef.current?.getBoundingClientRect().width ?? 0,
                height: tooltipRef.current?.getBoundingClientRect().height ?? 0
            },
            tooltip.corner
        )
        : null;

    return (
        <>
            <span
                className="lunar-card-action-badge"
                aria-label={action.label}
                onMouseEnter={(event) => setTooltip({ mouse: { x: event.clientX, y: event.clientY }, corner: "bottomRight" })}
                onMouseMove={(event) => {
                    const size = tooltipRef.current?.getBoundingClientRect();
                    setTooltip((current) => {
                        const corner = current?.corner ?? "bottomRight";
                        const mouse = { x: event.clientX, y: event.clientY };
                        return {
                            mouse,
                            corner: size ? bestActionTooltipCorner(mouse, { width: size.width, height: size.height }, corner) : corner
                        };
                    });
                }}
                onMouseLeave={() => setTooltip(null)}
            >
                {action.label.replace(" ", "\n")}
            </span>
            {tooltip && tooltipPosition ? createPortal(
                <div
                    ref={tooltipRef}
                    className="lunar-card-action-tooltip"
                    style={{
                        "--lunar-action-tooltip-left": `${tooltipPosition.left}px`,
                        "--lunar-action-tooltip-top": `${tooltipPosition.top}px`
                    } as CSSProperties}
                    role="tooltip"
                >
                    <strong>{action.label}</strong>
                    <ActionTooltipText text={action.text} />
                </div>,
                portalRoot()
            ) : null}
        </>
    );
};

const CardDepictionsView = ({ card }: { card: LunarBaseCard }) => {
    const colonists = Math.max(0, cardDisplayColonists(card));
    const achievements = cardDisplayAchievements(card);
    if (colonists === 0 && achievements.length === 0) return null;
    return (
        <span
            className="lunar-card-depictions"
            aria-label={[
                colonists > 0 ? `${colonists} colonist${colonists === 1 ? "" : "s"}` : null,
                achievements.length > 0 ? `achievements ${achievements.join(", ")}` : null
            ].filter(Boolean).join("; ")}
        >
            {colonists > 0 ? (
                <span className="lunar-card-colonists" style={{ "--lunar-card-depiction-color": lunarBaseColors.blue.css } as CSSProperties}>
                    {Array.from({ length: colonists }, () => "🧑‍🚀").join("")}
                </span>
            ) : null}
            {achievements.length > 0 ? (
                <span className="lunar-card-achievements" style={{ "--lunar-card-depiction-color": lunarBaseColors.red.css } as CSSProperties}>
                    {achievements.map(achievementGlyph).join("")}
                </span>
            ) : null}
        </span>
    );
};
