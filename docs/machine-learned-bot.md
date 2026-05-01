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
- Bot-vs-bot strengthening and candidate promotion are the next recommended training-quality steps.

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

Move-local features:

- active side
- moved piece type
- origin square category: center-adjacent, edge, corner-adjacent, interior
- destination square category
- whether the move captures
- number of captured pieces
- whether the move wins immediately
- whether the move reduces gold distance to the nearest corner
- whether the move increases raven pressure on gold

Resulting-position features:

- gold distance to nearest corner after move
- nearest raven distance to gold after move
- ravens adjacent to gold after move
- dragons mobility after move
- ravens mobility after move
- piece count difference after move
- dragons piece count after move
- ravens piece count after move
- whether gold remains movable after move
- whether the opponent has an immediate winning reply
- whether the move increases or decreases the active side's legal move count next turn
- whether the resulting position repeats a previously seen position key
- repetition indicator or repetition risk if cheaply available

Two feature abstractions are useful:

- position features derived from a snapshot
- move features derived from `(beforeSnapshot, move, afterSnapshot)`

The runtime bot should still score one legal move at a time because it ultimately chooses between legal moves. In practice that feature vector should combine move-local facts with position-derived facts from the `afterSnapshot`.

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
  "featureSchemaVersion": 2,
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

### Phase 2: Bot-Vs-Bot Strengthening

After the initial distilled `Michelle` exists, future cycles should strengthen it through offline bot-vs-bot play.

Recommended league participants:

- `Michelle` vs `Michelle`
- `Michelle` vs `Alphie`
- `Michelle` vs `Maxine`
- `Michelle` vs mixed baselines from diverse openings

Data to retain from league runs:

- full game result
- turn count
- sampled positions
- move chosen
- legal alternatives
- whether the game was later won, lost, or drawn
- whether the position led to a tactical failure or missed win

This gives the training loop fresh examples from the bot's own mistakes rather than only from expert-labeled static positions.

## Future Strengthening Roadmap

These steps extend the system beyond initial expert distillation.

### A. Candidate Vs Incumbent Promotion

Treat the current best `Michelle` artifact as the incumbent champion.

For each new training run:

- train a candidate artifact for one ruleset
- run candidate vs incumbent matches
- promote only if the candidate clears a predefined evaluation threshold

This reduces regression risk and creates a clear release gate.

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

### E. Population Training

Later, if useful:

- train multiple candidate `Michelle` variants with different seeds or hyperparameters
- run cross-play among them
- promote variants that are robust across the league rather than only against one incumbent

This can reduce brittleness and style collapse.

### F. Deeper Expert Refreshes

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
- iterate with bot-vs-bot strengthening
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
- [x] Replace the schema-1 placeholder artifact with the schema-2 expanded-feature artifact because runtime validation intentionally rejects old-schema artifacts
- [x] Tune the feature mix to remove low-signal or redundant features

Deliverable:

- first data-driven Sherwood `Michelle` artifact with documented evaluation results and explicit position-derived features in its encoder contract

Completed phase 3 notes:

- `MachineLearnedFeatureEncoder` now uses schema version 2 and exposes explicit `moveLocalFeatureNames`, `positionDerivedFeatureNames`, and combined `featureNames`.
- The expanded vector includes move-local piece/square/capture/win/delta signals plus after-position gold distance, raven pressure, mobility, material, gold mobility, opponent immediate-win, legal-move delta, repetition-risk, and shared evaluation features.
- The bundled Sherwood artifact was regenerated with `./gradlew runMachineLearnedTraining`, producing 4,306 training examples from 16 self-play games and 105 labeled positions.
- The installed artifact is `src/main/resources/bots/machine-learned/sherwood-rules.json`, has `featureSchemaVersion: 2`, and was trained from `deep-minimax` labels.
- The bot harness now includes Sherwood-only Michelle baseline smoke coverage. A one-game-per-matchup run completed 8 Michelle evaluation games with outcomes `{Dragons win=2, Draw by repetition=1, Ravens win=5}` and average 35.25 plies.

### Phase 4: Bot-Vs-Bot Strengthening Loop

Goal: improve `Michelle` through iterative offline play and candidate promotion.

Tasks:

1. Add candidate-vs-incumbent league tooling
2. Add self-play batches for `Michelle`
3. Add hard-position replay mining from losses and long games
4. Add opening diversity controls
5. Define promotion thresholds for replacing the incumbent artifact

Deliverable:

- repeatable offline improvement cycle for Sherwood `Michelle`

### Phase 5: Operational Hardening

Goal: make artifacts, training runs, and releases easier to manage safely.

Tasks:

1. Add richer artifact metadata and training summaries
2. Add explicit run ids and artifact naming conventions
3. Add evaluation report output
4. Document local workflows for training, evaluating, and releasing
5. Decide whether to keep training Kotlin-only or add a future Python trainer path

Deliverable:

- stable, documented local process for producing and releasing machine-learned artifacts

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

- Whether the offline training code should live in a dedicated Gradle source set or a separate module
- Whether a linear model is strong enough or if the first release should jump straight to a tiny MLP
- How much of the bot-vs-bot strengthening loop should be promoted into first-class Gradle tasks versus manual local scripts
- Whether future model artifacts should remain in Git or live outside the repo with a release import step

## Recommendation Summary

Build `Michelle` as a ruleset-scoped `machine-learned` bot with:

- offline local training only
- cheap runtime move ranking trained with per-position comparisons
- mixed move-local and resulting-position feature vectors
- one artifact per ruleset
- Sherwood-first rollout
- expert distillation first
- bot-vs-bot strengthening as the main future improvement path

This gives the project a pragmatic path to a stronger learned bot without fighting the current Kotlin-first architecture or blurring the boundaries between different Ravens and Dragons rule configurations.
