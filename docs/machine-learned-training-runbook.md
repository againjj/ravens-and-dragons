# Machine-Learned Bot Training Runbook

This runbook explains how the current `Michelle` training pipeline works, how to run it, how to read the outputs, and how to install or roll back a generated artifact.

## Current System

`Michelle` is the `machine-learned` bot. Runtime inference is intentionally simple:

1. The server loads JSON artifacts from `src/main/resources/bots/machine-learned/*.json`.
2. A valid artifact registers `Michelle` only for that artifact's `ruleConfigurationId`.
3. During a bot turn, Michelle first takes any immediate winning move.
4. If no immediate win exists, Michelle scores every legal move and chooses the highest score.
5. Scoring uses a linear move ranker: `bias + sum(weight[i] * feature[i])`.

The current bundled artifact is:

[`src/main/resources/bots/machine-learned/sherwood-rules.json`](/Users/jrayazian/code/ravens-and-dragons/src/main/resources/bots/machine-learned/sherwood-rules.json)

The current scope is intentionally narrow:

| Field | Current value |
|---|---|
| Bot id | `machine-learned` |
| Display name | `Michelle` |
| Ruleset | `sherwood-rules` |
| Model type | `linear-move-ranker` |
| Model format | `1` |
| Feature schema | `3` |
| Artifact format | JSON |

Do not reuse a Sherwood artifact for another ruleset. Add a separate artifact for each supported ruleset.

## Feature Schema

The encoder lives in [MachineLearnedFeatureEncoder.kt](/Users/jrayazian/code/ravens-and-dragons/src/main/kotlin/com/ravensanddragons/game/MachineLearnedFeatureEncoder.kt). Schema version `3` groups features by whether they are absolute or relative to the side to move.

Absolute features already mean the same thing from the mover's point of view. Relative features are encoded with a side multiplier: `+1` for dragon turns and `-1` for raven turns. In the current linear model, that is equivalent to multiplying relative feature weights by `-1` when Michelle is playing ravens.

The feature groups are:

| Group | Meaning |
|---|---|
| `absoluteMoveLocalFeatureNames` | Mover identity, moved piece type, captures, immediate wins, and mover-square geometry. |
| `relativeMoveLocalFeatureNames` | Gold-square geometry, gold corner progress, and raven pressure deltas. |
| `absolutePositionDerivedFeatureNames` | Opponent immediate-win danger, active-side legal-move delta, and shared evaluation from the mover's perspective. |
| `relativePositionDerivedFeatureNames` | Board facts whose value changes by side, such as gold distance, raven pressure, mobility, material, gold mobility, and repetition risk. |

Any generated artifact must have exactly one weight for each current feature name and must declare `featureSchemaVersion: 3`.

## Pipeline Shape

There are two main workflows: supervised training and evolution.

Supervised training produces a seed artifact:

1. Build self-play matchups from `--self-play-bot-ids`.
2. Run ordered pairings, meaning `random` as dragons vs `simple` as ravens is distinct from `simple` as dragons vs `random` as ravens.
3. Sample positions from those games.
4. Ask `--expert-bot-id` to choose the best move for each sampled position.
5. Encode every legal move from that position.
6. Label the expert move `1.0` and the other legal moves `0.0`.
7. Deduplicate repeated `(position, move)` examples.
8. Train a ranking model that scores the expert move above alternatives from the same position.
9. Write a dataset JSON and a runtime-compatible artifact JSON.

Evolution searches directly over Michelle weight vectors:

1. Start from the incumbent artifact and, optionally, a supervised seed artifact.
2. Fill a candidate population with mutations and crossover.
3. Run candidate-only round-robin games for each generation.
4. Keep top survivors and elites.
5. Create the next generation through mutation and crossover.
6. After the final generation, compare surviving candidates against the incumbent and configured baselines.
7. Write the best evolved artifact, one artifact for each final survivor, and an evolution report.
8. Mark the best survivor-comparison candidate promotable only if it clears the configured win/loss thresholds.

Baselines and the incumbent do not steer generation survivor selection; they are used in the final survivor comparison.

## Before You Run

Start from a workspace where generated files will be easy to identify:

```bash
git status --short
```

Run the focused Michelle tests before making a serious training run:

```bash
./gradlew test --tests com.ravensanddragons.training.MachineLearnedTrainingPipelineTest
./gradlew test --tests com.ravensanddragons.game.MachineLearnedBotPhaseOneTest
```

For a broader health check:

```bash
./gradlew test
```

## Run Supervised Training

The Gradle entrypoint is:

```bash
./gradlew runMachineLearnedTraining
```

With no arguments, it trains `sherwood-rules` using the default self-play bots, `deep-minimax` as the expert, all available CPU cores, and `build/machine-learned-candidate` as the output directory.

For a modest explicit run:

```bash
./gradlew runMachineLearnedTraining -PtrainingArgs='--mode train --rule-configuration-id sherwood-rules --expert-bot-id deep-minimax --self-play-bot-ids random,simple,minimax,deep-minimax --games-per-matchup 4 --sample-stride 2 --max-sampled-positions-per-game 8 --max-plies-per-game 300 --initial-seed 1 --output-dir build/machine-learned-candidate'
```

Expected outputs:

| Output | Default path |
|---|---|
| Dataset | `build/machine-learned-candidate/sherwood-rules.dataset.json` |
| Seed artifact | `build/machine-learned-candidate/sherwood-rules.generated.json` |

The CLI also reads the artifact back after writing it, so a successful run proves the generated JSON passes the shared artifact reader.

Progress output is intentionally compact:

```text
Generating dataset:
0%..10%..20%..30%..40%..50%..60%..70%..80%..90%..100%
Training model:
0%..10%..20%..30%..40%..50%..60%..70%..80%..90%..100%
```

## Validate A Seed Artifact

After supervised training, inspect the generated artifact:

```bash
sed -n '1,80p' build/machine-learned-candidate/sherwood-rules.generated.json
```

Confirm these fields:

| Field | Expected value |
|---|---|
| `botId` | `machine-learned` |
| `displayName` | `Michelle` |
| `ruleConfigurationId` | `sherwood-rules` |
| `modelFormatVersion` | `1` |
| `featureSchemaVersion` | `3` |
| `modelType` | `linear-move-ranker` |

Then run:

```bash
./gradlew test --tests com.ravensanddragons.game.MachineLearnedBotPhaseOneTest
```

That test covers artifact validation, registration, legal move selection, immediate-win preference, and ruleset scoping.

## Run Evolution

Use evolution before replacing the bundled artifact. The usual input is the current bundled artifact as incumbent, plus an optional supervised seed artifact from the previous step.

```bash
./gradlew runMachineLearnedTraining -PtrainingArgs='--mode evolve --rule-configuration-id sherwood-rules --incumbent-artifact src/main/resources/bots/machine-learned/sherwood-rules.json --seed-artifact build/machine-learned-candidate/sherwood-rules.generated.json --population-size 24 --survivor-count 6 --generations 20 --games-per-matchup 1 --baseline-bot-ids minimax,deep-minimax --max-plies-per-game 300 --opening-random-plies 2 --mutation-rate 0.15 --mutation-scale 0.10 --crossover-rate 0.50 --elite-count 2 --survivor-comparison-games-per-pairing 4 --minimum-promotion-win-rate 0.55 --maximum-promotion-loss-rate 0.35 --output-dir build/machine-learned-candidate'
```

Expected outputs:

| Output | Default path |
|---|---|
| Best evolved artifact | `build/machine-learned-candidate/sherwood-rules.evolved.json` |
| Final survivor artifacts | `build/machine-learned-candidate/sherwood-rules.<candidateId>.json` |
| Evolution report | `build/machine-learned-candidate/sherwood-rules.evolution-report.json` |

Evolution progress is one compact meter covering generation games plus survivor comparison games:

```text
Running evolution matches:
0%..10%..20%..30%..40%..50%..60%..70%..80%..90%..100%
```

## Read The Evolution Report

Open the report:

```bash
sed -n '1,220p' build/machine-learned-candidate/sherwood-rules.evolution-report.json
```

Important fields:

| Field | Meaning |
|---|---|
| `generationSummaries` | Candidate-only generation results, including candidate scores, match outcomes, survivors, and best candidate per generation. |
| `survivorComparisonMatches` | Final games between surviving candidates, the incumbent, and configured baselines. |
| `survivorComparisonRankings` | Ranked comparison participants with score, wins, losses, and draws. |
| `bestCandidateId` | Highest-ranked candidate in survivor comparison; its model was written to the evolved artifact. |
| `finalPromotionDecision.promote` | Whether the best candidate cleared the configured promotion thresholds. |
| `finalPromotionDecision.reason` | Human-readable reason for the promotion decision. |

Treat `finalPromotionDecision.promote: true` as the minimum bar for installing an evolved artifact. If it is `false`, keep the incumbent and adjust the run: more generations, larger population, better supervised seed, more survivor comparison games, or different mutation settings.

## Option Reference

All CLI arguments are passed through Gradle with `-PtrainingArgs='...'`. Each option is written as `--name value`.

General options:

| Option | Default | Meaning |
|---|---|---|
| `--mode` | `train` | `train` runs supervised training; `evolve` runs population search. |
| `--rule-configuration-id` | `sherwood-rules` | Ruleset for dataset generation, artifact metadata, and evolution games. |
| `--max-plies-per-game` | `300` | Hard cap before a self-play or evolution game is stopped as a draw. |
| `--opening-random-plies` | `0` in train mode unless set; commonly `2` in evolve commands | Number of early plies selected randomly before normal strategy resumes. |
| `--initial-seed` | `1` | Starting seed for deterministic random choices. |
| `--worker-count` | available CPU count | Parallel workers for dataset games, labeling work, or evolution matches. |
| `--output-dir` | `build/machine-learned-candidate` | Directory for generated datasets, artifacts, and reports. |

Supervised training options:

| Option | Default | Meaning |
|---|---|---|
| `--expert-bot-id` | `deep-minimax` | Bot that labels sampled positions with the preferred move. |
| `--self-play-bot-ids` | `random,simple,minimax,deep-minimax` | Comma-separated bots used to generate self-play games. |
| `--games-per-matchup` | `1` | Number of games for each ordered self-play pairing. |
| `--sample-stride` | `2` | Keep positions where `plyIndex % sampleStride == 0`. |
| `--max-sampled-positions-per-game` | `8` | Maximum sampled positions labeled from one game. |
| `--dataset-filename` | `<ruleset>.dataset.json` | Dataset output filename. |
| `--artifact-filename` | `<ruleset>.generated.json` | Supervised artifact output filename. |

Evolution options:

| Option | Default | Meaning |
|---|---|---|
| `--incumbent-artifact` | required for `evolve` | Current artifact used to seed population and final comparison. |
| `--seed-artifact` | omitted | Optional artifact used as an initial candidate. Repeat this option to seed evolution with multiple artifacts. |
| `--baseline-bot-ids` | `minimax,deep-minimax` | Baselines included in survivor comparison, not generation selection. |
| `--population-size` | `24` | Number of Michelle candidates per generation. |
| `--survivor-count` | `6` | Top candidates kept after each generation. |
| `--generations` | `20` | Number of selection/mutation/crossover cycles. |
| `--mutation-rate` | `0.15` | Per-weight probability of random perturbation. |
| `--mutation-scale` | `0.10` | Size of weight perturbations. |
| `--crossover-rate` | `0.50` | Probability a child blends two survivor parents. |
| `--elite-count` | `2` | Top survivors copied unchanged into the next generation. |
| `--survivor-comparison-games-per-pairing` | `4` | Ordered games per pairing in the final survivor/incumbent/baseline comparison. |
| `--minimum-promotion-win-rate` | `0.55` | Minimum win rate for promotion across best-candidate comparison games. |
| `--maximum-promotion-loss-rate` | `0.35` | Maximum loss rate for promotion across best-candidate comparison games. |
| `--report-filename` | `<ruleset>.evolution-report.json` | Evolution report filename. |
| `--evolved-artifact-filename` | `<ruleset>.evolved.json` | Best evolved artifact filename. |

Notes:

- `--games-per-matchup` is used in both modes. In train mode it controls self-play games per ordered bot pairing; in evolve mode it controls candidate-vs-candidate games per ordered pairing.
- `--seed-artifact` may be repeated, for example `--seed-artifact first.json --seed-artifact second.json`; all provided seeds are added to the initial population with the incumbent before mutation fills the rest.
- `--final-gate-games-per-pairing` is still accepted as a backward-compatible alias for `--survivor-comparison-games-per-pairing`, but new commands should use `--survivor-comparison-games-per-pairing`.
- More workers usually reduce wall-clock time but increase CPU and memory pressure.

## Install A New Artifact

Install only after validation and, for evolved candidates, a passing promotion decision.

Keep a backup of the current bundled artifact:

```bash
cp src/main/resources/bots/machine-learned/sherwood-rules.json build/machine-learned-candidate/sherwood-rules.previous.json
```

Install a supervised seed artifact:

```bash
cp build/machine-learned-candidate/sherwood-rules.generated.json src/main/resources/bots/machine-learned/sherwood-rules.json
./gradlew test --tests com.ravensanddragons.game.MachineLearnedBotPhaseOneTest
```

Install an evolved artifact:

```bash
cp build/machine-learned-candidate/sherwood-rules.evolved.json src/main/resources/bots/machine-learned/sherwood-rules.json
./gradlew test --tests com.ravensanddragons.game.MachineLearnedBotPhaseOneTest
```

For a release-quality check, run the full suite:

```bash
./gradlew test
```

## Roll Back

If the new artifact fails validation or plays badly, restore the backup:

```bash
cp build/machine-learned-candidate/sherwood-rules.previous.json src/main/resources/bots/machine-learned/sherwood-rules.json
./gradlew test --tests com.ravensanddragons.game.MachineLearnedBotPhaseOneTest
```

## Optional Bot Harness Smoke Test

The bot harness evaluates the installed artifact against baseline bots on Sherwood. It is useful after installation because it tests the exact artifact the app will load.

```bash
./gradlew botMatchHarnessTest -DbotMatchHarnessGamesPerMatchup=1
```

For a larger smoke run:

```bash
./gradlew botMatchHarnessTest -DbotMatchHarnessGamesPerMatchup=10
```

The harness proves that games complete and records basic outcomes. It is not a statistical proof that one artifact is stronger unless you run enough games and inspect the results accordingly.

## Troubleshooting

If training fails:

- Confirm the ruleset is `sherwood-rules`.
- Confirm every bot id in `--self-play-bot-ids`, `--expert-bot-id`, and `--baseline-bot-ids` is valid for Sherwood.
- Reduce `--worker-count` if the machine is CPU or memory constrained.
- Reduce `--games-per-matchup`, `--population-size`, `--generations`, or `--survivor-comparison-games-per-pairing` for faster debugging runs.
- Run `./gradlew test --tests com.ravensanddragons.training.MachineLearnedTrainingPipelineTest` to isolate pipeline failures.

If Michelle disappears from the UI after installing an artifact:

- Confirm the file is still named `sherwood-rules.json`.
- Confirm the JSON has `ruleConfigurationId: "sherwood-rules"`.
- Confirm the JSON has `botId: "machine-learned"` and `displayName: "Michelle"`.
- Confirm the JSON has `featureSchemaVersion: 3`.
- Run `./gradlew test --tests com.ravensanddragons.game.MachineLearnedBotPhaseOneTest`.

If evolution does not promote a candidate:

- Check `finalPromotionDecision.reason`.
- Increase `survivor-comparison-games-per-pairing` if results look noisy.
- Improve the supervised seed artifact before evolving.
- Increase `population-size` or `generations` for a broader search.
- Lower `mutation-scale` if candidates are unstable; raise it if the search is not moving.

## Recommended Safe Loop

1. Run focused tests.
2. Generate a supervised seed artifact with `--mode train`.
3. Validate the generated artifact metadata and runtime loader test.
4. Run evolution with the current bundled artifact as incumbent and the supervised artifact as seed.
5. Inspect `finalPromotionDecision` in the evolution report.
6. Install only if the evolved candidate promotes.
7. Run Michelle runtime tests, then `./gradlew test`.
8. Optionally run `botMatchHarnessTest` for a broader Sherwood smoke test.
