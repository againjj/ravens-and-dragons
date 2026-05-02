# Machine-Learned Bot Design

## Status

This document proposes a Sherwood-first machine-learned bot architecture for Ravens and Dragons.

- Internal bot id: `machine-learned`
- User-facing bot name: `Michelle`
- First target ruleset: `sherwood-rules`
- Training mode: offline local training only
- Runtime mode: cheap inference inside the existing Kotlin server

Current implementation status:

- Phase 1 runtime scaffolding is implemented.
- Phase 2 Kotlin-first offline training pipeline is implemented for local use.
- The current trainer already uses per-position ranking updates over legal-move groups rather than a global positive-versus-negative average.
- Phase 3 position-derived feature expansion is implemented with a generated Sherwood `Michelle` artifact.
- Evolutionary bot strengthening is implemented for local offline runs and replaces the old single-candidate strengthen gate.
- Operational hardening around run ids, artifact naming, reports, metadata provenance, and release workflow is implemented.

The design assumes that each trained artifact is scoped to exactly one `ruleConfigurationId`. A future `Michelle` artifact for another ruleset should be trained, stored, evaluated, and released separately rather than shared across rulesets.

## Goals

- Add a new bot named `Michelle` whose expensive work happens offline and locally.
- Keep runtime move selection cheap enough to load as a normal server-side bot.
- Preserve the current backend architecture where canonical rules stay in the Kotlin game module.
- Support future training for other rule configurations without coupling those runs together.
- Allow the first training system to target `Sherwood Rules` while keeping the infrastructure generic.
- Create a path for later bot-vs-bot strengthening without committing to a large reinforcement learning system immediately.

## Non-Goals

- Replacing the current search bots.
- Training in the live request path or during app startup.
- Sharing one model artifact across multiple rulesets.
- Moving canonical rule evaluation outside the Kotlin backend.
- Building a full neural-network serving stack in the first phase.

## Existing Architecture Context

The current codebase already has the two seams this design needs:

- Rule behavior is selected by `ruleConfigurationId` through `RuleCatalog` and `RuleSet`.
- Bot behavior is selected through `GameBotStrategy` and registered in `BotRegistry`.

Relevant files:

- [src/main/kotlin/com/ravensanddragons/game/RuleCatalog.kt](/Users/jrayazian/code/ravens-and-dragons/src/main/kotlin/com/ravensanddragons/game/RuleCatalog.kt)
- [src/main/kotlin/com/ravensanddragons/game/RuleEngine.kt](/Users/jrayazian/code/ravens-and-dragons/src/main/kotlin/com/ravensanddragons/game/RuleEngine.kt)
- [src/main/kotlin/com/ravensanddragons/game/GameRules.kt](/Users/jrayazian/code/ravens-and-dragons/src/main/kotlin/com/ravensanddragons/game/GameRules.kt)
- [src/main/kotlin/com/ravensanddragons/game/BotModels.kt](/Users/jrayazian/code/ravens-and-dragons/src/main/kotlin/com/ravensanddragons/game/BotModels.kt)
- [src/main/kotlin/com/ravensanddragons/game/BotRegistry.kt](/Users/jrayazian/code/ravens-and-dragons/src/main/kotlin/com/ravensanddragons/game/BotRegistry.kt)
- [src/main/kotlin/com/ravensanddragons/game/AlphaBetaGameBotStrategy.kt](/Users/jrayazian/code/ravens-and-dragons/src/main/kotlin/com/ravensanddragons/game/AlphaBetaGameBotStrategy.kt)

This means the machine-learned bot can remain a normal `GameBotStrategy` implementation, while offline training can reuse the existing canonical rules and current strong search bots for data generation.

## High-Level Architecture

The recommended architecture has three layers:

1. Offline training pipeline
2. Shared feature and artifact layer
3. Runtime inference bot

### 1. Offline Training Pipeline

This pipeline runs locally and never in the production request path.

Responsibilities:

- Generate training positions for one `ruleConfigurationId` at a time
- Reuse canonical Kotlin rules for legal move generation and move application
- Label positions using strong expert play, initially from existing search bots
- Train a lightweight move-ranking model
- Evaluate candidate artifacts against baseline bots
- Export one artifact for one ruleset

### 2. Shared Feature And Artifact Layer

This layer provides the stable contract between training and runtime.

Responsibilities:

- Encode `GameSnapshot` and legal moves into numeric features
- Version feature schemas
- Read and write trained artifacts
- Validate that artifacts are tied to exactly one `ruleConfigurationId`

### 3. Runtime Inference Bot

This layer runs inside the server and should be cheap enough to behave like the current bot strategies.

Responsibilities:

- Load a previously trained artifact
- Validate that the active snapshot matches the artifact's `ruleConfigurationId`
- Score legal moves cheaply
- Return a legal move
- Preserve guardrails such as immediate-win selection and illegal-move fallback handling already present in the bot runner path

## Why A Lightweight Move-Ranking Model

The first version should not begin with a large reinforcement learning stack. A lightweight move-ranking model is a better fit for the current codebase because it:

- keeps inference cheap
- is easy to serialize as a small artifact
- works well with existing search bots as expert labelers
- can be trained entirely offline
- gives us a clean path to later self-play refinement

Recommended first model:

- model type: linear move ranker or very small multilayer perceptron
- input: handcrafted move-local features plus handcrafted features derived from the resulting position
- output: score for each legal move
- selection rule: choose the highest-scoring legal move

The intended training objective is per-position ranking, not isolated global classification. For each sampled position, the trainer should compare the expert-preferred legal move against the alternatives from that same legal-move set.

## Ruleset Scoping Rules

The machine-learned system must enforce the following:

- each training run targets exactly one `ruleConfigurationId`
- each artifact declares exactly one `ruleConfigurationId`
- runtime registration only exposes `Michelle` for rulesets that have a valid artifact
- a Sherwood artifact must not silently be used for `square-one`, `original-game`, or any other configuration

This restriction is intentional. It prevents accidental leakage of Sherwood-specific assumptions into future rulesets and keeps training, evaluation, and release decisions easy to reason about.

## Proposed Runtime Components

Add the following Kotlin runtime files under `src/main/kotlin/com/ravensanddragons/game`:

- `MachineLearnedBotStrategy.kt`
- `MachineLearnedModel.kt`
- `MachineLearnedModelLoader.kt`
- `MachineLearnedFeatureEncoder.kt`
- `MachineLearnedMoveScorer.kt`
- `MachineLearnedRegistry.kt`

### `MachineLearnedModel.kt`

Owns the in-memory representation of one model artifact.

Proposed responsibilities:

- bot metadata
- `ruleConfigurationId`
- feature schema version
- model format version
- numeric weights or layer parameters
- optional training summary metadata

Suggested model metadata shape:

```kotlin
data class MachineLearnedModelMetadata(
    val botId: String,
    val displayName: String,
    val ruleConfigurationId: String,
    val featureSchemaVersion: Int,
    val modelFormatVersion: Int,
    val trainedAt: Instant
)
```

### `MachineLearnedModelLoader.kt`

Loads artifact files from resources and validates them.

Responsibilities:

- parse artifact JSON
- reject unsupported model format versions
- reject unsupported feature schema versions
- reject duplicate artifacts for the same ruleset
- reject artifacts whose `botId` is not `machine-learned`

### `MachineLearnedFeatureEncoder.kt`

Encodes move-level features for training and inference.

Responsibilities:

- expose a stable encoder contract
- compute features from `(beforeSnapshot, move, afterSnapshot)`
- keep feature ordering deterministic
- declare a schema version

### `MachineLearnedMoveScorer.kt`

Applies the loaded model to an encoded feature vector and returns a score.

Responsibilities:

- implement the cheap inference math
- isolate model format details from the strategy

### `MachineLearnedBotStrategy.kt`

Implements `GameBotStrategy`.

Proposed runtime algorithm:

1. receive `snapshot` and `legalMoves`
2. verify the snapshot ruleset matches the loaded model ruleset
3. return an immediate winning move if one exists
4. for each legal move:
   - apply the move using canonical `GameRules`
   - encode move features
   - score the move
5. choose the highest-scoring legal move
6. preserve deterministic tie-breaking

### `MachineLearnedRegistry.kt`

This helper owns discovery of available machine-learned artifacts and exposes them to `BotRegistry`.

Responsibilities:

- load all bundled `machine-learned` artifacts at startup
- publish summaries by supported ruleset
- keep one artifact per ruleset

## Proposed Offline Training Components

The first version should stay Kotlin-first so it can directly reuse the existing rules and bot logic.

Recommended location:

- `src/train/kotlin/com/ravensanddragons/training/...`

Proposed files:

- `TrainingExample.kt`
- `MachineLearnedDatasetGenerator.kt`
- `MachineLearnedSelfPlayRunner.kt`
- `MachineLearnedTrainer.kt`
- `MachineLearnedArtifactWriter.kt`
- `MachineLearnedArtifactReader.kt`
- `MachineLearnedEvaluation.kt`
- `MachineLearnedTrainingCli.kt`

If the repository later wants Python-based model training, this Kotlin-first phase can still remain useful as the canonical dataset generator and artifact validator.

## Training Data Design

The first training loop should use expert-labeled move-ranking examples grouped by position.

Each example should contain:

- position key
- `ruleConfigurationId`
- encoder schema version
- board size
- snapshot state or encoded position state
- legal moves
- candidate move
- expert score or expert-preferred flag
- outcome metadata if available

Suggested conceptual shape:

```kotlin
data class TrainingExample(
    val ruleConfigurationId: String,
    val featureSchemaVersion: Int,
    val features: FloatArray,
    val label: Float,
    val source: TrainingExampleSource
)
```

Possible `source` values:

- `expert-imitation`
- `self-play-win`
- `self-play-loss`
- `hard-position-replay`

## Feature Strategy

The first version should use handcrafted features rather than raw board tensors.

Reasons:

- much simpler inference
- easy inspection and debugging
- lower implementation risk
- better fit for a first Sherwood-only rollout

Recommended first-pass features:

Absolute move-local features:

- whether the gold moved
- whether the move captures
- number of captured pieces
- whether the move wins immediately
- mover origin square category: center-adjacent, edge, corner-adjacent, interior
- mover destination square category

Relative move-local features:

- gold origin square category: center-adjacent, edge, corner-adjacent, interior
- gold destination square category
- gold distance delta to the nearest corner
- raven pressure delta on gold

Absolute resulting-position features:

- whether the opponent has an immediate winning reply
- number of mover-owned pieces that the opponent could capture on the next move
- whether the move increases or decreases the active side's legal move count next turn
- shared evaluation score from the active side's perspective

Relative resulting-position features:

- gold distance to nearest corner after move
- nearest raven distance to gold after move
- ravens adjacent to gold after move
- dragons mobility after move
- ravens mobility after move
- dragons piece count after move
- ravens piece count after move
- whether gold remains movable after move
- whether the resulting position repeats a previously seen position key

Two feature abstractions are useful:

- position features derived from a snapshot
- move features derived from `(beforeSnapshot, move, afterSnapshot)`

The runtime bot should still score one legal move at a time because it ultimately chooses between legal moves. In practice that feature vector should combine move-local facts with position-derived facts from the `afterSnapshot`. Relative features are encoded with a `+1` multiplier for dragon turns and a `-1` multiplier for raven turns, which is equivalent to flipping those feature weights for raven moves in the current linear ranker.

## Artifact Format

The first version should use JSON artifacts because they are simple to inspect and version.

Suggested path pattern:

- `src/main/resources/bots/machine-learned/<ruleConfigurationId>.json`

Suggested artifact shape:

```json
{
  "botId": "machine-learned",
  "displayName": "Michelle",
  "modelFormatVersion": 1,
  "featureSchemaVersion": 4,
  "ruleConfigurationId": "sherwood-rules",
  "trainedAt": "2026-04-30T00:00:00Z",
  "trainingSummary": {
    "expertBotId": "deep-minimax",
    "positions": 250000,
    "selfPlayGames": 20000
  },
  "modelType": "linear-move-ranker",
  "bias": 0.08,
  "weights": [0.12, -0.44, 1.03]
}
```

Required validation rules:

- `botId` must be `machine-learned`
- `displayName` should be `Michelle`
- `ruleConfigurationId` must be non-empty
- `modelFormatVersion` must be supported by runtime
- `featureSchemaVersion` must match the runtime encoder

## Registration Strategy

`BotRegistry` should continue to expose bot availability by ruleset, but `Michelle` should be artifact-driven rather than hardcoded to the full supported ruleset list.

Behavior:

- if a valid Sherwood artifact exists, `Michelle` appears for `sherwood-rules`
- if no artifact exists for `square-one`, `Michelle` does not appear there
- if a future `square-one` artifact is later added, `Michelle` can appear for that ruleset too

This keeps availability honest and avoids exposing unsupported configurations in the UI.

## Training Approach

### Phase 1: Expert Distillation

The first model should be trained from strong search bot decisions rather than pure self-play reinforcement learning.

Recommended experts:

- primary: `Alphie` (`deep-minimax`)
- secondary: `Maxine` (`minimax`) for diversity or fallback

Offline data generation flow:

1. generate Sherwood games using expert and mixed-opponent self-play
2. sample positions from those games
3. ask the expert to choose the best move for sampled positions
4. convert each legal move at those positions into move-ranking examples
5. train the model to rank the expert move above the alternatives from the same sampled position

This is the fastest route to a cheap runtime bot that still inherits useful strength from the stronger search bots.

### Phase 2: Population-Based Evolution

After the initial distilled `Michelle` exists, future cycles should strengthen it through offline population search.

Recommended generation loop:

1. seed a population from the incumbent, an optional supervised artifact, and mutations around those models
2. run candidate-vs-candidate games in both seat assignments
3. rank candidates by candidate-only league score
4. keep survivors and elites
5. create children through random weight perturbation and crossover
6. repeat for several generations
7. run a survivor comparison league that ranks the surviving population against the incumbent and fixed baselines

Data to retain from evolution runs:

- full game result
- turn count
- candidate id and parent ids
- candidate origin, such as incumbent, seed, mutation, or crossover
- generation scores and survivor ids
- survivor comparison rankings and win/loss/draw rates

This makes game outcome the optimization signal rather than relying only on expert-labeled static positions.

## Future Strengthening Roadmap

These steps extend the system beyond initial expert distillation.

### A. Evolutionary Population Search

Treat the current best `Michelle` artifact as the incumbent anchor, not as the only opponent.

For each evolution run:

- create many candidates
- run a population league
- discard poor performers
- mutate and combine survivors
- repeat for configurable generations
- promote only if the best survivor ranks above the incumbent and baselines in the survivor comparison league

This reduces brittleness and avoids making promotion depend on a single candidate's lucky or unlucky run.

### B. Self-Play Refinement

Once the first distilled model is stable:

- run large Sherwood-only self-play batches
- sample difficult positions from losses, long draws, and near-wins
- mix those positions back into the next training dataset

This helps `Michelle` learn from the style it actually produces at runtime.

### C. Hard-Position Replay

Maintain a replay pool of mistakes such as:

- blunders that immediately lose gold
- missed forced wins
- repeated tactical traps
- positions where `Michelle` diverges sharply from the expert

Oversample these positions in later training runs to reduce repeated failures.

### D. Opening Diversity

To avoid overfitting a narrow line:

- randomize among legal early-game branches
- optionally seed games from curated midgame Sherwood positions
- ensure both dragons and ravens perspectives are represented evenly

### E. Deeper Expert Refreshes

As training improves:

- generate new labels from deeper `Alphie` searches
- reserve deeper search for only the most ambiguous or high-value positions

This improves label quality without exploding cost across every example.

## Runtime Performance Expectations

The live bot should be much cheaper than deep search.

Expected runtime profile:

- enumerate legal moves
- apply each move once
- compute a modest feature vector
- do simple scoring math
- choose the best legal move

This should make `Michelle` practical as a server bot even if offline training is expensive.

## Risks And Mitigations

### Risk: Feature Schema Drift

If training and runtime encoders disagree, the model becomes invalid.

Mitigation:

- version the feature schema
- validate schema versions at load time
- keep the encoder contract centralized

### Risk: Silent Cross-Ruleset Leakage

If a Sherwood artifact is used elsewhere, behavior may be misleading or weak.

Mitigation:

- artifact includes exactly one `ruleConfigurationId`
- runtime validates exact match
- registry exposes support only from loaded artifacts

### Risk: Cheap Model Is Too Weak

The first move-ranker may not be competitive enough.

Mitigation:

- begin with expert distillation from `Alphie`
- retain immediate-win checks
- iterate with population-based bot evolution
- consider a slightly richer model only if the lightweight ranker is insufficient

### Risk: Training Cost Grows Too Quickly

Deep expert labeling and large leagues can become expensive.

Mitigation:

- start with a linear model and limited feature set
- sample positions rather than labeling every ply
- reserve deeper expert labeling for selected hard positions

## Testing Strategy

### Runtime Tests

Add tests under `src/test/kotlin/com/ravensanddragons/game` for:

- loading a valid Sherwood artifact
- rejecting unsupported artifact versions
- rejecting wrong `botId`
- rejecting duplicate ruleset artifacts
- refusing snapshots from the wrong ruleset
- returning only legal moves
- preferring an immediate win when one exists
- completing bot-vs-bot matches without errors

### Offline Training Tests

Add tests or harness coverage for:

- dataset generation limited to one ruleset
- deterministic feature ordering
- artifact round-trip read/write
- candidate evaluation report generation

### Evaluation Harness

Extend the bot harness so Sherwood-only comparisons can cover:

- `Michelle` vs `Randall`
- `Michelle` vs `Simon`
- `Michelle` vs `Maxine`
- `Michelle` vs `Alphie`
- candidate `Michelle` vs incumbent `Michelle`

## Detailed Implementation Plan

### Phase 1: Runtime Scaffolding

Goal: support loading and running a cheap machine-learned bot with a placeholder artifact.

Status: complete

Completed work:

- [x] Add machine-learned model types and loader
- [x] Add the runtime feature encoder and move scorer
- [x] Add `MachineLearnedBotStrategy`
- [x] Add artifact discovery and registration support
- [x] Register bot id `machine-learned` with display name `Michelle`
- [x] Add bundled Sherwood artifact support for smoke-tested runtime use
- [x] Add runtime validation tests

Deliverable:

- the app can expose `Michelle` for `sherwood-rules` from a bundled artifact and choose legal moves cheaply

### Phase 2: Kotlin-First Offline Training Pipeline

Goal: generate Sherwood-only datasets and export first-class artifacts locally.

Status: complete

Completed work:

- [x] Add a training source set or equivalent Gradle wiring for offline training code
- [x] Add self-play runner reuse around canonical `GameRules`
- [x] Add dataset generation from expert and mixed-opponent play
- [x] Add training example serialization
- [x] Add artifact writer and reader
- [x] Add a CLI entrypoint for local training runs
- [x] Train with per-position ranking updates over grouped legal-move examples
- [x] Deduplicate repeated `(position, move)` examples
- [x] Parallelize per-game dataset and training work across available CPUs by default

Deliverable:

- local command can produce a Sherwood-only machine-learned artifact

### Phase 3: Position-Derived Feature Expansion And First Trainable Michelle

Goal: strengthen the current trainer by adding richer resulting-position signal, then train the first useful `Michelle` from expert-labeled Sherwood positions.

Status: complete

Tasks:

- [x] Audit the current encoder and separate its outputs into explicit move-local and position-derived groups
- [x] Add the first batch of resulting-position features from the `afterSnapshot`
- [x] Bump the feature schema version and keep runtime/training validation strict
- [x] Regenerate the Sherwood dataset with the expanded feature vector
- [x] Train a candidate artifact using the existing per-position ranking trainer
- [x] Run the Sherwood evaluation suite against baseline bots
- [x] Replace old-schema artifacts when runtime validation intentionally rejects them
- [x] Tune the feature mix to remove low-signal or redundant features

Deliverable:

- first data-driven Sherwood `Michelle` artifact with documented evaluation results and explicit position-derived features in its encoder contract

Completed phase 3 notes:

- `MachineLearnedFeatureEncoder` now uses schema version 4 and exposes explicit absolute and relative move-local/resulting-position feature groups, plus the legacy combined `moveLocalFeatureNames`, `positionDerivedFeatureNames`, and `featureNames`.
- The expanded vector includes move-local gold/square/capture/win/delta signals plus after-position gold distance, raven pressure, mobility, material, gold mobility, opponent immediate-win, opponent capture-threat count, legal-move delta, repetition-risk, and shared evaluation features.
- Relative feature values are sign-adjusted by side before scoring, using `+1` for dragon moves and `-1` for raven moves.
- The bundled Sherwood artifact was regenerated with `./gradlew runMachineLearnedTraining`, producing 4,306 training examples from 16 self-play games and 105 labeled positions.
- The installed artifact is `src/main/resources/bots/machine-learned/sherwood-rules.json`, has `featureSchemaVersion: 4`, and preserves existing weights by feature name from the previous artifact while setting the new `after-opponent-captures` weight to `0`.
- The bot harness now includes Sherwood-only Michelle baseline smoke coverage. A one-game-per-matchup run completed 8 Michelle evaluation games with outcomes `{Dragons win=2, Draw by repetition=1, Ravens win=5}` and average 35.25 plies.

### Phase 4: Population-Based Evolution Loop

Goal: improve `Michelle` through iterative offline population search instead of a single-candidate promotion gate.

Status: complete

Tasks:

1. [x] Remove the old `--mode strengthen` workflow so strengthening is no longer a one-candidate pass/fail check
2. [x] Add a population of Michelle candidate artifacts seeded from the incumbent and an optional trained artifact
3. [x] Run candidate-vs-candidate leagues with swapped seats and seeded opening diversity
4. [x] Keep generation scoring candidate-only so baselines and the incumbent do not steer survivor selection
5. [x] Rank candidates by candidate-only league results and keep configurable survivors plus elites
6. [x] Generate the next population with random weight perturbation and crossover between survivors
7. [x] Repeat for configurable generations
8. [x] Run a survivor comparison ranking against the incumbent and configured baselines
9. [x] Write a best evolved artifact and an evolution report

Deliverable:

- repeatable offline evolutionary improvement cycle for Sherwood `Michelle`

Completed phase 4 notes:

- `MachineLearnedEvolutionLoop` runs a configurable population of linear Michelle models through candidate-only round-robins, survivor selection, mutation, crossover, and a final survivor/incumbent/baseline comparison ranking.
- The loop treats supervised training as a seed generator rather than the whole strengthening mechanism; `--seed-artifact` can point at a freshly trained artifact, while `--incumbent-artifact` anchors the search.
- Candidate models use the existing schema-4 feature vector and linear weight artifact format, so mutation and crossover can operate directly on model weights without changing runtime inference.
- Evolution games use configurable early opening randomization through `openingRandomPlies`.
- The evolution report includes per-generation candidate scores, survivor ids, match summaries, survivor comparison rankings, and a final promotion decision.
- The existing `runMachineLearnedTraining` CLI now supports `--mode evolve`; `--mode strengthen` has been removed.

Implementation plan now embodied by phase 4:

1. Use normal `train` mode to produce an optional supervised seed artifact.
2. Start evolution from the incumbent, the optional seed, and mutations around those anchors.
3. For each generation, play every candidate against the others in both seat assignments.
4. Score candidates only from candidate-vs-candidate wins, draws, and losses.
5. Preserve elites, keep survivors, and fill the next generation with survivor mutations and crossover children.
6. After the final generation, rank the surviving candidates against the incumbent and configured baselines in a separate comparison league.
7. Install the evolved artifact only if the final promotion decision passes the configured win-rate and loss-rate thresholds.

### Phase 5: Operational Hardening

Goal: make artifacts, training runs, and releases easier to manage safely.

Status: complete

Tasks:

1. [x] Add richer artifact metadata and training summaries
2. [x] Add explicit run ids and artifact naming conventions
3. [x] Add evaluation report output
4. [x] Document local workflows for training, evaluating, and releasing
5. [x] Decide whether to keep training Kotlin-only or add a future Python trainer path

Deliverable:

- stable, documented local process for producing and releasing machine-learned artifacts

Completed phase 5 notes:

- Generated artifacts now include run provenance under `trainingSummary.run`, including run id, mode, command-line arguments, seed, worker count, output directory, and written dataset/artifact/report paths.
- Training artifacts include self-play parameters such as bot ids, games per matchup, sampling settings, max plies, and opening-random-ply count.
- Evolved artifacts include `trainingSummary.evolution`, mirroring the final promotion decision and recording the incumbent, seed artifacts, and baseline bots used for survivor comparison.
- The CLI accepts `--run-id`; when it is omitted, generated dataset, artifact, survivor, and report files use a default `<ruleset>.<mode>.<UTC timestamp>` id to reduce accidental overwrites.
- The Kotlin-first trainer remains the supported path. A future Python trainer is still possible, but it should import/export the same schema-versioned artifact contract instead of replacing the canonical Kotlin rule/data path.

## Suggested Local Commands

Exact command wiring can be chosen during implementation, but the workflow should support commands equivalent to:

```bash
./gradlew trainMachineLearnedSherwood
./gradlew evaluateMachineLearnedSherwood
./gradlew botMatchHarnessTest -DbotMatchHarnessGamesPerMatchup=10
```

If a CLI main is preferred instead of dedicated Gradle tasks, keep the command surface small and ruleset-explicit. The first generation should not allow an omitted ruleset argument that defaults silently to something other than Sherwood.

## Acceptance Criteria For Phase 1

Phase 1 should be considered complete when:

- the server can load a valid `machine-learned` artifact at startup
- `Michelle` appears only for rulesets with a loaded artifact
- a Sherwood artifact only registers support for `sherwood-rules`
- the runtime strategy always returns a legal move
- the runtime strategy respects immediate winning moves
- tests cover artifact validation and ruleset scoping

## Open Questions

- Whether a linear model is strong enough or if the first release should jump straight to a tiny MLP
- Whether future model artifacts should remain in Git or live outside the repo with a release import step

## Recommendation Summary

Build `Michelle` as a ruleset-scoped `machine-learned` bot with:

- offline local training only
- cheap runtime move ranking trained with per-position comparisons
- mixed move-local and resulting-position feature vectors
- one artifact per ruleset
- Sherwood-first rollout
- expert distillation first
- population-based evolution as the main future improvement path

This gives the project a pragmatic path to a stronger learned bot without fighting the current Kotlin-first architecture or blurring the boundaries between different Ravens and Dragons rule configurations.
