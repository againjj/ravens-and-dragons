import type { GameStartOptions } from "@ravensanddragons/platform-frontend/game-entry";
import type { GinRummyConfig } from "./gin-rummy-types";
import { updateCreateOptions } from "./gin-rummy-slice";
import { useGinRummyDispatch, useGinRummySelector } from "./gin-rummy-store";

export const CreateGinRummyScreen = ({ onStartGame }: { gameName: string; onStartGame: (options?: GameStartOptions | boolean) => void }) => {
    const dispatch = useGinRummyDispatch();
    const {
        publiclyListed,
        targetScore,
        playMode,
        bigGinAllowed,
        optionalDealRule,
        lineBonusEnabled,
        shutoutBonusEnabled,
        aceHighAllowed
    } = useGinRummySelector((state) => state.ginRummy.createOptions);

    return (
        <section className="panel gin-create-panel">
            <div className="page-header-copy">
                <h2>Create Gin Rummy</h2>
            </div>
            <div className="gin-create-options">
                <label className="control-row gin-create-row">
                    <span className="control-label">Target score</span>
                    <input
                        className="text-input"
                        type="number"
                        min="1"
                        value={targetScore}
                        onChange={(event) => dispatch(updateCreateOptions({ targetScore: Number(event.target.value) }))}
                    />
                </label>
                <label className="control-row gin-create-row">
                    <span className="control-label">Game type</span>
                    <span className="select-shell">
                        <select value={playMode} onChange={(event) => dispatch(updateCreateOptions({ playMode: event.target.value as GinRummyConfig["playMode"] }))}>
                            <option value="singleGame">Single game</option>
                            <option value="bestOfFiveMatch">Best of five match</option>
                        </select>
                    </span>
                </label>
                <label className="checkbox-row"><input type="checkbox" checked={publiclyListed} onChange={(event) => dispatch(updateCreateOptions({ publiclyListed: event.target.checked }))} /><span>Publicly list game</span></label>
                <label className="checkbox-row"><input type="checkbox" checked={bigGinAllowed} onChange={(event) => dispatch(updateCreateOptions({ bigGinAllowed: event.target.checked }))} /><span>Allow Big Gin</span></label>
                <label className="checkbox-row"><input type="checkbox" checked={optionalDealRule} onChange={(event) => dispatch(updateCreateOptions({ optionalDealRule: event.target.checked }))} /><span>Optional 11-card first deal</span></label>
                <label className="checkbox-row"><input type="checkbox" checked={lineBonusEnabled} onChange={(event) => dispatch(updateCreateOptions({ lineBonusEnabled: event.target.checked }))} /><span>Line Bonus</span></label>
                <label className="checkbox-row"><input type="checkbox" checked={shutoutBonusEnabled} onChange={(event) => dispatch(updateCreateOptions({ shutoutBonusEnabled: event.target.checked }))} /><span>Shutout Bonus</span></label>
                <label className="checkbox-row"><input type="checkbox" checked={aceHighAllowed} onChange={(event) => dispatch(updateCreateOptions({ aceHighAllowed: event.target.checked }))} /><span>Ace can be high in runs</span></label>
            </div>
            <button
                type="button"
                onClick={() => onStartGame({
                    publiclyListed,
                    targetScore,
                    playMode,
                    bigGinAllowed,
                    optionalDealRule,
                    lineBonusEnabled,
                    shutoutBonusEnabled,
                    aceHighAllowed
                })}
            >
                Start
            </button>
        </section>
    );
};
