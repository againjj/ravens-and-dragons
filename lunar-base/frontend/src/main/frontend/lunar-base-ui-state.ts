import { canPlayHandCard } from "./lunar-base-board-rules";
import { canPlayCard } from "./lunar-base-game-logic";
import type { LunarBaseCard, LunarBaseGame, LunarBasePlayer } from "./lunar-base-types";

export interface LunarBaseActionUiState {
    canUseControls: boolean;
    isCurrentTurnViewer: boolean;
    isActionActor: boolean;
    canChooseMainAction: boolean;
    canPlayAgents: boolean;
    canBuild: boolean;
    canDiscardForAction: boolean;
    canDraftSupply: boolean;
    canResellSupply: boolean;
    canFlipForAction: boolean;
    shouldDimUntargetableCards: boolean;
    isHandCardTarget: (card: LunarBaseCard, isViewer: boolean) => boolean;
    isSupplyCardTarget: (card: LunarBaseCard | null) => boolean;
    handCardTargetState: (card: LunarBaseCard, isViewer: boolean) => LunarBaseCardTargetState;
    supplyCardTargetState: (card: LunarBaseCard | null) => LunarBaseCardTargetState;
    stockTargetState: (cardCount: number) => LunarBaseCardTargetState;
    discardTargetState: (card: LunarBaseCard | null) => LunarBaseCardTargetState;
    canFlipStationCard: (playerIndex: number, cardId: string) => boolean;
}

export interface LunarBaseCardTargetState {
    isTarget: boolean;
    canClick: boolean;
    canDrag: boolean;
    dimmed: boolean;
}

export const endGamePopupTitle = (game: LunarBaseGame): string | null => {
    const result = game.endGameResult;
    if (!result) return null;
    const names = result.playerIndexes.map((index) => game.seats[index]?.displayName ?? `Player ${index + 1}`).join(", ");
    if (result.label === "Draw") return `Draw between ${names}`;
    return `${result.label} for ${names}${result.label === "Epic Victory" ? "!" : ""}`;
};

export const endGamePopupText = (game: LunarBaseGame): string | null => {
    const result = game.endGameResult;
    if (!result) return null;
    return result.conditions
        .map((condition) => {
            const name = game.seats[condition.playerIndex]?.displayName ?? `Player ${condition.playerIndex + 1}`;
            const text = condition.conditions.join(", ");
            return result.label === "Draw" ? `${name}: ${text}` : text;
        })
        .join("\n");
};

export const actionPanelStatus = (game: LunarBaseGame, viewerSeat: number | null): string => {
    if (game.lifecycle === "finished") return endGamePopupTitle(game) ?? "Game over";
    const interaction = game.actionState?.interaction ?? null;
    if (interaction) {
        const text = game.actionState.statusText || "Action in progress";
        if (interaction.actorIndex === viewerSeat) return text;
        const actorName = game.seats[interaction.actorIndex]?.displayName ?? `Player ${interaction.actorIndex + 1}`;
        return `Waiting for ${actorName}:\n${text}`;
    }
    if (viewerSeat === game.currentPlayerIndex) return "Play an agent or choose a main action";
    const currentName = game.seats[game.currentPlayerIndex]?.displayName ?? `Player ${game.currentPlayerIndex + 1}`;
    return `Waiting for ${currentName}:\nPlay an agent or choose a main action`;
};

export const deriveActionUiState = ({
    game,
    viewerSeat,
    viewerPlayer,
    isSubmitting
}: {
    game: LunarBaseGame;
    viewerSeat: number | null;
    viewerPlayer: LunarBasePlayer | null;
    isSubmitting: boolean;
}): LunarBaseActionUiState => {
    const actionState = game.actionState;
    const interaction = actionState?.interaction ?? null;
    const canUseControls = game.lifecycle === "active" && !isSubmitting;
    const isCurrentTurnViewer = viewerSeat === game.currentPlayerIndex && canUseControls;
    const isActionActor = viewerSeat !== null && interaction?.actorIndex === viewerSeat && canUseControls;
    const canChooseMainAction = isCurrentTurnViewer && actionState.phase === "choosingMainAction" && !actionState.mainActionChosen;
    const canPlayAgents = canChooseMainAction;
    const canBuild = isActionActor && interaction?.kind === "build";
    const canDiscardForAction = isActionActor && interaction?.kind === "discard";
    const canDraftSupply = isActionActor && interaction?.kind === "draft";
    const canResellSupply = isActionActor && interaction?.kind === "resell";
    const canFlipForAction = isActionActor && (interaction?.kind === "flipStation" || interaction?.kind === "flipStationTo");
    const shouldDimUntargetableCards = canChooseMainAction || isActionActor;
    const flippedStationIds = new Set(interaction?.flippedStationIds ?? []);
    const isHandCardTarget = (card: LunarBaseCard, isViewer: boolean) => Boolean(isViewer && viewerPlayer && (
        (card.type === "agent" && canPlayAgents && canPlayCard(card, viewerPlayer)) ||
        (card.type === "module" && canBuild && canPlayHandCard(card, viewerPlayer)) ||
        canDiscardForAction
    ));
    const isSupplyCardTarget = (card: LunarBaseCard | null) => Boolean(card && (canDraftSupply || canResellSupply));

    return {
        canUseControls,
        isCurrentTurnViewer,
        isActionActor,
        canChooseMainAction,
        canPlayAgents,
        canBuild,
        canDiscardForAction,
        canDraftSupply,
        canResellSupply,
        canFlipForAction,
        shouldDimUntargetableCards,
        isHandCardTarget,
        isSupplyCardTarget,
        handCardTargetState: (card, isViewer) => {
            const isTarget = isHandCardTarget(card, isViewer);
            return {
                isTarget,
                canClick: Boolean(isViewer && isTarget),
                canDrag: Boolean(isViewer && isTarget),
                dimmed: Boolean(shouldDimUntargetableCards && !isTarget)
            };
        },
        supplyCardTargetState: (card) => {
            const isTarget = isSupplyCardTarget(card);
            return {
                isTarget,
                canClick: isTarget,
                canDrag: isTarget,
                dimmed: Boolean(shouldDimUntargetableCards && card && !isTarget)
            };
        },
        stockTargetState: (cardCount) => ({
            isTarget: false,
            canClick: false,
            canDrag: false,
            dimmed: Boolean(shouldDimUntargetableCards && cardCount > 0)
        }),
        discardTargetState: (card) => {
            const isTarget = canPlayAgents || canDiscardForAction || canResellSupply;
            return {
                isTarget,
                canClick: false,
                canDrag: false,
                dimmed: Boolean(shouldDimUntargetableCards && card && !isTarget)
            };
        },
        canFlipStationCard: (playerIndex, cardId) => {
            if (!isActionActor || !canFlipForAction || flippedStationIds.has(cardId)) return false;
            if (interaction?.kind === "flipStationTo") return playerIndex === viewerSeat;
            return interaction?.kind === "flipStation";
        }
    };
};
