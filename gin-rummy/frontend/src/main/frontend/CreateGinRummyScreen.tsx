import { useState } from "react";
import type { GameStartOptions } from "@ravensanddragons/platform-frontend/game-entry";
import type { GinRummyConfig } from "./gin-rummy-types";
export const CreateGinRummyScreen = ({ onStartGame }: { gameName: string; onStartGame: (options?: GameStartOptions | boolean) => void }) => {
    const [publiclyListed, setPubliclyListed] = useState(true);
    const [targetScore, setTargetScore] = useState(100);
    const [playMode, setPlayMode] = useState<GinRummyConfig["playMode"]>("singleGame");
    const [bigGinAllowed, setBigGinAllowed] = useState(false);
    const [optionalDealRule, setOptionalDealRule] = useState(true);
    const [lineBonusEnabled, setLineBonusEnabled] = useState(false);
    const [shutoutBonusEnabled, setShutoutBonusEnabled] = useState(true);
    const [aceHighAllowed, setAceHighAllowed] = useState(true);

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
                        onChange={(event) => setTargetScore(Number(event.target.value))}
                    />
                </label>
                <label className="control-row gin-create-row">
                    <span className="control-label">Game type</span>
                    <span className="select-shell">
                        <select value={playMode} onChange={(event) => setPlayMode(event.target.value as GinRummyConfig["playMode"])}>
                            <option value="singleGame">Single game</option>
                            <option value="bestOfFiveMatch">Best of five match</option>
                        </select>
                    </span>
                </label>
                <label className="checkbox-row"><input type="checkbox" checked={publiclyListed} onChange={(event) => setPubliclyListed(event.target.checked)} /><span>Publicly list game</span></label>
                <label className="checkbox-row"><input type="checkbox" checked={bigGinAllowed} onChange={(event) => setBigGinAllowed(event.target.checked)} /><span>Allow Big Gin</span></label>
                <label className="checkbox-row"><input type="checkbox" checked={optionalDealRule} onChange={(event) => setOptionalDealRule(event.target.checked)} /><span>Optional 11-card first deal</span></label>
                <label className="checkbox-row"><input type="checkbox" checked={lineBonusEnabled} onChange={(event) => setLineBonusEnabled(event.target.checked)} /><span>Line Bonus</span></label>
                <label className="checkbox-row"><input type="checkbox" checked={shutoutBonusEnabled} onChange={(event) => setShutoutBonusEnabled(event.target.checked)} /><span>Shutout Bonus</span></label>
                <label className="checkbox-row"><input type="checkbox" checked={aceHighAllowed} onChange={(event) => setAceHighAllowed(event.target.checked)} /><span>Ace can be high in runs</span></label>
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

