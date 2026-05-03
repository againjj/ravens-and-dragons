# Machine-Trained Feature Schema Plan

This plan describes the schema-5 feature-vector change for `Michelle`, the `machine-trained` bot. The migration described here has been implemented: runtime artifacts now use side-specific dragon/raven weight vectors, raw schema-5 features, structural uncapturability signals, and no schema-4 runtime fallback.

## Goals

- Replace relative sign-flipped features with side-specialized weights.
- Remove weak origin geometry features.
- Remove the shared hand-authored evaluation feature.
- Add compact tactical features for gold escape, containment, immediate punishment, material, mobility, and durable square occupation.
- Keep the model linear and artifact-backed.
- Keep the feature count small enough for supervised training and evolution to remain practical.

## Non-Goals

- Do not change game rules.
- Do not move canonical game logic out of Kotlin.
- Do not add a neural model in this phase.
- Do not add per-square feature slots for every board coordinate.
- Do not make `Michelle` depend on frontend code.

## Recommended Model Shape

Introduce a new feature schema, tentatively schema version `5`, and a new artifact model format if the JSON shape changes.

The preferred model is still a linear move ranker, but it should use separate weight vectors by side:

```json
{
  "modelType": "side-specialized-linear-move-ranker",
  "featureSchemaVersion": 5,
  "dragonWeights": [],
  "ravenWeights": []
}
```

Runtime scoring should:

1. encode one raw feature vector with no relative sign flipping,
2. choose `dragonWeights` when `beforeSnapshot.activeSide == dragons`,
3. choose `ravenWeights` when `beforeSnapshot.activeSide == ravens`,
4. score with `bias + sum(weight[i] * feature[i])`.

The bias can either remain shared or become side-specific. Start with a shared bias unless training results show that side-specific bias is useful.

## Naming Rules

Prefer features whose meaning is stable from the mover's point of view:

- `mover-*`
- `opponent-*`
- `gold-*`

Use explicit piece names only when the piece identity matters independently of side:

- `dragon-count`
- `raven-count`
- `gold-present`

Avoid encoding the same concept twice as both `dragon-*` and `raven-*` when `mover-*` and `opponent-*` are enough. Side-specific weight vectors can learn different interpretations for the same raw fact.

## Features To Remove

Remove current origin geometry features:

```text
mover-origin-center-adjacent
mover-origin-edge
mover-origin-corner-adjacent
gold-origin-center-adjacent
gold-origin-edge
gold-origin-corner-adjacent
```

Remove the hand-authored evaluation feature:

```text
after-evaluation-for-active-side
```

This feature can import the old bot evaluation's biases into Michelle and make it harder to discover better behavior through training and evolution.

Treat `captures-gold` and `move-wins-immediately` as redundant for current original-style/Sherwood rules. Capturing gold ends the game, and Michelle already has an immediate-win shortcut before feature scoring. If only one remains in schema 5, prefer:

```text
move-wins-immediately
```

If the immediate-win shortcut is guaranteed to stay outside the scorer, this feature can also be removed from the regular move-ranking vector. Keep it only if the same scorer will later be reused inside search or diagnostic reports.

## Proposed Schema 5 Feature Set

Start compact. The target is roughly 20-30 features.

### Move-Local Features

```text
moved-piece-gold
captured-opponent-count
move-wins-immediately
gold-corner-distance-delta
raven-pressure-delta
moved-piece-to-structurally-uncapturable-square
```

Notes:

- `captured-opponent-count` is acceptable if all non-gold captures are similar enough for the first schema 5 pass.
- If capture detail is needed, split into `captured-regular-count` and `captured-gold`, but avoid keeping `captured-gold` if it only duplicates `move-wins-immediately`.
- `gold-corner-distance-delta` should be positive when the move improves dragon escape progress.
- `raven-pressure-delta` should be positive when ravens increase pressure around gold.
- With side-specific weights, these deltas should remain raw facts. Do not multiply by side.

### Resulting-Position Features

```text
after-gold-corner-distance
after-gold-legal-move-count
after-gold-on-structurally-uncapturable-square
after-nearest-raven-distance-to-gold
after-ravens-adjacent-to-gold
after-mover-legal-move-count
after-opponent-legal-move-count
after-mover-piece-count
after-opponent-piece-count
after-opponent-immediate-win
after-opponent-capture-threat-count
after-opponent-can-capture-gold
after-mover-structurally-uncapturable-piece-count
after-opponent-structurally-uncapturable-piece-count
after-position-repeat-risk
```

Optional additions if the first pass is still below the desired feature budget:

```text
after-second-nearest-raven-distance-to-gold
after-gold-minimum-ravens-needed-to-capture
after-moved-piece-structural-capture-line-count
after-empty-square-count
after-ply-count-normalized
```

Add optional features only when the implementation can compute them cheaply and tests can make their meaning obvious.

## Structural Uncapturability

Structural uncapturability means that, given a piece's square, no legal future opponent move can ever create a capture of that piece while it remains on that square.

For original-style/Sherwood regular pieces, this is not the same as asking whether an opposite capture pair exists. A would-be support square can itself be impossible for the opponent to occupy because the target piece plus a fixed hostile square would immediately capture that support.

For the current odd boards, the structurally uncapturable regular-piece squares are edge squares two steps from a corner along that edge.

On 7x7 with center `d4`:

```text
c1, e1, a3, g3, a5, g5, c7, e7
```

On 9x9 with center `e5`:

```text
c1, g1, a3, i3, a7, i7, c9, g9
```

Implementation guidance:

- Add a Kotlin helper near the existing board/capture geometry code, not in frontend code.
- Precompute structural square facts by `boardSize`, `specialSquare`, and relevant piece type when possible.
- Exclude illegal occupancy squares from regular-piece tables: corners and center are not legal regular-piece destinations.
- Treat gold separately because gold has special capture rules near the center and wins on corners.
- Do not simulate arbitrary future games. Use structural capture geometry and legal-occupancy constraints.

Suggested helper names:

```kotlin
isStructurallyUncapturableRegularSquare(square, boardSize, specialSquare)
isStructurallyUncapturableGoldSquare(square, boardSize, specialSquare)
structurallyUncapturableSquares(boardSize, specialSquare, piece)
```

The feature encoder can then expose compact booleans and counts instead of one feature per square.

## Artifact And Data Migration

Because schema 5 changes both feature semantics and the weight shape, do not support schema 4 as a long-term runtime compatibility path. Migrate existing machine-trained data and artifacts to schema 5, then make runtime loading require schema 5.

Recommended migration path:

1. Add schema 5 encoder, model, artifact payload, and validation.
2. Add a one-time migration utility for existing schema 4 data and artifacts.
3. Convert or regenerate every checked-in machine-trained artifact under `src/main/resources/bots/machine-trained`.
4. Convert any existing training datasets that should remain useful; otherwise explicitly retire them and document that they must be regenerated.
5. Update runtime loading so bundled machine-trained artifacts must declare `featureSchemaVersion: 5`.
6. Remove schema 4 runtime loading/scoring support after the migration artifacts are checked in.
7. Keep only enough schema 4 test fixture code to prove the migration utility rejects malformed input and produces valid schema 5 output, if the migration utility remains in the repo.

Schema-aware validation should check:

   - `featureSchemaVersion`,
   - model type,
   - expected feature count,
   - expected side-specific weight count when using schema 5.

Generated artifacts should include feature names or a feature schema identifier that can be validated by name, not only by count.

If a schema 4 artifact cannot be meaningfully converted because removed features have no schema 5 equivalent, prefer regenerating it through supervised training and evolution. Do not preserve runtime fallback behavior just to keep stale artifacts loadable.

### Migration Semantics

Schema 4 weights cannot be losslessly mapped to schema 5 because:

- origin geometry features are removed,
- `after-evaluation-for-active-side` is removed,
- relative sign-flipped features become raw features with side-specific weights,
- new tactical features have no schema 4 weights.

For any mechanical artifact migration, use conservative initialization:

- copy still-equivalent absolute weights into both side vectors,
- map schema 4 relative weights into dragon weights as-is,
- map schema 4 relative weights into raven weights with the sign inverted,
- omit removed feature weights,
- initialize new feature weights to `0.0`,
- mark the artifact metadata as migrated and not yet promoted.

This migrated artifact should be treated only as a seed for training/evolution, not as a production-strength replacement. The preferred production path is to regenerate schema 5 data and promote an evolved schema 5 artifact.

## Training Changes

Supervised training must learn two side-specific vectors:

- update the trainer to maintain separate dragon and raven weights,
- group ranking examples by active side,
- update only the active side's weights for each example,
- preserve feature scaling per feature; decide whether scales are shared or side-specific.

Start with shared feature scales across both sides so dragon and raven artifacts remain easier to inspect. If one side's training becomes unstable, revisit side-specific scaling.

Evolution must mutate and cross over both side vectors:

- mutate `dragonWeights` and `ravenWeights`,
- cross over each side vector independently,
- report side-vector summaries in evolution metadata if useful,
- keep promotion comparison unchanged at first.

Do not add more evolution changes in the same implementation unless needed. Fixed opening suites, shaped fitness, and rating-based survivor selection are valuable but are separate improvements.

## Runtime Changes

Runtime strategy should continue to:

1. validate the artifact supports the current ruleset,
2. take any immediate winning move before scoring,
3. apply each legal move once,
4. encode schema 5 features from the before/after snapshots,
5. score with the side-specific vector,
6. keep deterministic tie-breaking.

Feature computation should be careful about legal-move generation. Features such as opponent capture threats and gold mobility can be expensive if they rescan legal moves many times per candidate. Cache per-resulting-position values during one `chooseMove` call if profiling or test data shows this is needed.

## Tests

Add focused backend tests before replacing artifacts.

Feature encoder tests:

- schema 5 feature count matches the feature-name list,
- no origin geometry features remain,
- no `after-evaluation-for-active-side` feature remains,
- dragon and raven turns encode the same raw board facts without sign flipping,
- structural uncapturability returns the expected 7x7 squares,
- structural uncapturability returns the expected 9x9 squares,
- moving to `a3` or `c1` sets `moved-piece-to-structurally-uncapturable-square`,
- moving to an ordinary edge/interior square does not set that feature.

Artifact tests:

- schema 5 artifact accepts matching `dragonWeights` and `ravenWeights`,
- schema 5 artifact rejects missing side weights,
- schema 5 artifact rejects wrong side-weight length,
- runtime loader rejects schema 4 artifacts after migration,
- migration utility converts a minimal schema 4 artifact into a valid schema 5 seed, if the utility remains in the repo.

Strategy tests:

- Michelle still returns only legal moves,
- Michelle still takes an immediate winning move,
- Michelle chooses different scores for the same feature vector depending on active side when dragon and raven weights differ.

Training tests:

- supervised training updates only the active side's vector for side-specific examples,
- generated schema 5 artifacts round-trip through the shared artifact reader/writer,
- evolution mutation/crossover preserve both side weight lengths.

Run at least:

```bash
./gradlew test --tests com.ravensanddragons.game.MachineTrainedBotPhaseOneTest
./gradlew test --tests com.ravensanddragons.training.MachineTrainingPipelineTest
```

Run the full suite before installing a promoted artifact:

```bash
./gradlew test
```

## Documentation Updates

When implementing schema 5, update:

- `docs/machine-training-runbook.md`
- `docs/machine-trained-bot-improvements.md`
- `docs/code-summary.md`
- `README.md` if user-facing bot behavior, commands, or artifact workflow changes

The runbook should document the new artifact shape, feature schema, validation expectations, and training/evolution commands.

## Suggested Implementation Phases

### Phase 1: Geometry And Feature Contract

- Add structural uncapturability helpers.
- Add schema 5 feature-name lists.
- Add feature encoder tests for removed and added features.
- Keep runtime behavior unchanged until the scorer can load schema 5 artifacts.

### Phase 2: Artifact And Scorer Support

- Add schema 5 artifact payload fields.
- Add side-specialized scorer.
- Add loader validation for side weight vectors.
- Add migration utility support for schema 4 artifacts and datasets that must be preserved.
- Add round-trip and rejection tests.

### Phase 3: Training Support

- Update supervised training for side-specific vectors.
- Update artifact writer output.
- Update training pipeline tests.
- Generate a small schema 5 seed artifact and verify it loads.

### Phase 4: Evolution Support

- Update candidate mutation and crossover for both side vectors.
- Update evolution reports only as needed.
- Run a short evolution smoke test.

### Phase 5: Candidate Evaluation And Rollout

- Migrate or regenerate all bundled machine-trained artifacts to schema 5.
- Remove schema 4 runtime loading support.
- Train a schema 5 seed artifact.
- Evolve from that seed against the incumbent and configured baselines.
- Run focused Michelle tests.
- Run the bot match harness for Sherwood.
- Promote only if survivor comparison clears the configured threshold.
- Replace the bundled Sherwood artifact only after successful validation.

## Open Questions

- Should `move-wins-immediately` remain in schema 5 if the immediate-win shortcut always runs before scoring?
- Should capture detail stay as `captured-opponent-count`, or split regular-piece captures by strategic value?
- Should feature scaling be shared between sides or side-specific?
- Should `gold-on-structurally-uncapturable-square` include terminal corner squares, or should terminal gold positions remain outside normal scoring?
- Should 9x9 structural square facts be added now even though the current bundled Michelle artifact is Sherwood-only?
