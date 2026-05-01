# Machine-Learned Bot Training Runbook

This runbook describes how to train and install a new `Michelle` artifact with the current Kotlin-first offline pipeline.

## Should We Train Now?

Yes, for candidate iteration or replacement runs.

The phase 4 pipeline is now in place:

- Gradle exposes `runMachineLearnedTraining`
- the offline training code can generate a Sherwood-only dataset
- the trainer can export a runtime-compatible JSON artifact
- the artifact can be loaded back through the runtime validation rules
- the current encoder uses schema version 2 with explicit move-local and resulting-position feature names
- the bot match harness includes a Sherwood-only Michelle baseline smoke evaluation
- training self-play can randomize early opening plies for more diverse positions
- the CLI can run population-based evolution with candidate leagues, mutation, crossover, and promotion thresholds
- evolution reports include generation scores, survivor ids, match outcomes, and final gate results

What this means in practice:

- we can generate a new local `Michelle` artifact now
- this is appropriate for an iteration artifact
- we can evolve a population of candidates against each other, baselines, and the current incumbent before installing a winner

If the goal is “produce a new artifact and try it locally,” training can begin now.

If the goal is “replace the bundled artifact with a clearly stronger model,” run the evolution workflow and treat promotion as blocked unless the report clears the configured thresholds.

## Current Scope

The current training pipeline is intentionally narrow:

- ruleset: `sherwood-rules`
- runtime bot id: `machine-learned`
- display name: `Michelle`
- artifact format: JSON
- feature schema: version 2
- install location: `src/main/resources/bots/machine-learned/<ruleConfigurationId>.json`

Do not reuse a Sherwood artifact for another ruleset.

## Prerequisites

Before training:

1. Make sure the repo builds locally.
2. Make sure Java 21 is available through the project toolchain.
3. Make sure Gradle can run successfully on your machine.
4. Start from a clean enough workspace that you can tell generated artifacts from unrelated local changes.

Useful checks:

```bash
./gradlew test --tests com.ravensanddragons.training.MachineLearnedTrainingPipelineTest
./gradlew test --tests com.ravensanddragons.game.MachineLearnedBotPhaseOneTest
```

## Training Command

The training entrypoint is:

```bash
./gradlew runMachineLearnedTraining
```

By default it trains a Sherwood artifact, uses all available CPUs for per-game dataset generation work, writes outputs under `build/machine-learned-candidate`, and reports coarse progress for dataset generation and model training.

Progress output is intentionally compact:

```text
Generating dataset:
0%..10%..20%..30%..40%..50%..60%..70%..80%..90%..100%
Training model:
0%..10%..20%..30%..40%..50%..60%..70%..80%..90%..100%
```

Example:

```bash
./gradlew runMachineLearnedTraining -PtrainingArgs='--rule-configuration-id sherwood-rules --expert-bot-id deep-minimax --self-play-bot-ids random,simple,minimax,deep-minimax --games-per-matchup 2 --sample-stride 2 --max-sampled-positions-per-game 8 --max-plies-per-game 300 --initial-seed 1 --output-dir build/machine-learned-candidate'
```

## Training Arguments

The CLI currently supports these arguments:

- `--mode`
- `--rule-configuration-id`
- `--expert-bot-id`
- `--self-play-bot-ids`
- `--games-per-matchup`
- `--sample-stride`
- `--max-sampled-positions-per-game`
- `--max-plies-per-game`
- `--opening-random-plies`
- `--initial-seed`
- `--worker-count`
- `--output-dir`
- `--dataset-filename`
- `--artifact-filename`
- `--seed-artifact`
- `--incumbent-artifact`
- `--baseline-bot-ids`
- `--population-size`
- `--survivor-count`
- `--generations`
- `--mutation-rate`
- `--mutation-scale`
- `--crossover-rate`
- `--elite-count`
- `--final-gate-games-per-pairing`
- `--minimum-promotion-win-rate`
- `--maximum-promotion-loss-rate`
- `--report-filename`
- `--evolved-artifact-filename`

What each argument means and what it changes:

- `--mode`
  - Meaning: chooses `train` or `evolve`.
  - Effect: `train` generates a dataset and seed artifact; `evolve` runs population search and writes a best evolved artifact plus report.
  - Current guidance: use `train` first when you want a supervised seed, then `evolve` before replacing the bundled artifact.
- `--rule-configuration-id`
  - Meaning: chooses the single ruleset this run is allowed to train.
  - Effect: controls the opening positions, legal moves, sampled states, expert labeling, dataset metadata, and artifact metadata.
  - Current guidance: keep this as `sherwood-rules` unless both runtime and training support have been intentionally extended for another ruleset.
- `--expert-bot-id`
  - Meaning: selects the bot that labels sampled positions with the preferred move.
  - Effect: changes the imitation target that Michelle learns from.
  - Practical tradeoff: stronger experts can produce better labels, but labeling work can take longer.
- `--self-play-bot-ids`
  - Meaning: comma-separated list of bots used to generate training games, such as `random,simple,minimax,deep-minimax`.
  - Effect: the generator runs every dragons-vs-ravens pairing across this list, so a list of four ids creates sixteen matchup pairs before multiplying by `games-per-matchup`.
  - Practical tradeoff: a more diverse list broadens the positions Michelle sees, but it also increases total run time.
- `--games-per-matchup`
  - Meaning: how many games to generate for each ordered bot pairing.
  - Effect: scales the number of self-play games linearly.
  - Practical tradeoff: larger values usually produce bigger, more varied datasets, but they increase training time and disk output.
- `--sample-stride`
  - Meaning: how often to sample plies from each self-play game.
  - Effect: only positions whose `plyIndex % sampleStride == 0` are considered for labeling.
  - Practical tradeoff: smaller values keep more positions and produce denser datasets; larger values reduce labeling cost and file size.
- `--max-sampled-positions-per-game`
  - Meaning: hard cap on how many sampled positions from one game are turned into labeled examples.
  - Effect: prevents long games from dominating the dataset.
  - Practical tradeoff: larger values increase per-game influence and artifact generation cost; smaller values spread weight more evenly across games.
- `--max-plies-per-game`
  - Meaning: maximum ply count allowed before the training runner forces a draw and stops that self-play game.
  - Effect: bounds pathological or very long games so runs finish in predictable time.
  - Practical tradeoff: larger values preserve more long-game behavior; smaller values cap cost more aggressively.
- `--opening-random-plies`
  - Meaning: number of early plies selected randomly before normal bot strategy takes over.
  - Effect: diversifies openings during dataset generation and evolution games.
  - Practical tradeoff: larger values broaden opening coverage but can add noisier positions; use small values such as `1` or `2` for candidate evaluation.
- `--initial-seed`
  - Meaning: starting deterministic seed used when assigning per-game seeds.
  - Effect: controls the reproducible ordering of generated matchups and any seeded random choices inside the training pipeline.
  - Practical tradeoff: changing it can produce a different dataset even with the same other arguments.
- `--worker-count`
  - Meaning: maximum number of concurrent worker threads for per-game self-play and labeling work.
  - Effect: controls how much CPU parallelism the dataset generator uses.
  - Practical tradeoff: higher values reduce wall-clock time on multi-core machines but increase simultaneous CPU and memory pressure.
  - Default: if omitted, the CLI uses `Runtime.getRuntime().availableProcessors()`.
- `--output-dir`
  - Meaning: destination directory for generated dataset and artifact files.
  - Effect: changes where the run writes its outputs.
  - Practical tradeoff: useful for keeping candidate runs separate, for example `build/machine-learned-candidate`.
- `--dataset-filename`
  - Meaning: output filename for the dataset JSON.
  - Effect: changes only the dataset file name, not the artifact file name or training behavior.
  - Practical tradeoff: useful if you want to keep multiple datasets in the same output directory.
- `--artifact-filename`
  - Meaning: output filename for the generated Michelle artifact JSON.
  - Effect: changes only the artifact file name, not the dataset contents or training behavior.
  - Practical tradeoff: useful for keeping multiple candidate artifacts side by side.
- `--seed-artifact`
  - Meaning: optional path to a supervised artifact when `--mode evolve`.
  - Effect: adds that artifact to the initial population alongside the incumbent and mutations.
  - Practical tradeoff: useful for seeding evolution from fresh expert imitation, but not required.
- `--incumbent-artifact`
  - Meaning: path to the current incumbent artifact when `--mode evolve`.
  - Effect: anchors the initial population and final promotion gate.
  - Practical tradeoff: usually point this at `src/main/resources/bots/machine-learned/sherwood-rules.json`.
- `--baseline-bot-ids`
  - Meaning: comma-separated baseline bot ids for candidate comparisons in evolution mode.
  - Effect: adds ordered candidate-vs-baseline games in both seats during generation leagues and the final gate.
  - Practical tradeoff: `minimax,deep-minimax` is a useful default; more baselines increase confidence and run time.
- `--population-size`
  - Meaning: number of Michelle candidates in each generation.
  - Effect: scales candidate diversity and round-robin cost.
  - Practical tradeoff: larger populations explore more, but match count grows quickly.
- `--survivor-count`
  - Meaning: number of top candidates kept after each generation.
  - Effect: controls selection pressure.
  - Practical tradeoff: fewer survivors exploit faster; more survivors preserve diversity.
- `--generations`
  - Meaning: number of population cycles to run.
  - Effect: controls how many rounds of evaluation, selection, mutation, and crossover happen.
  - Practical tradeoff: more generations search longer and cost more.
- `--mutation-rate`
  - Meaning: probability that each model weight is perturbed when creating a child.
  - Effect: controls how many features change per mutation.
  - Practical tradeoff: higher values explore faster but can disrupt good candidates.
- `--mutation-scale`
  - Meaning: relative size of random weight perturbations.
  - Effect: controls how far mutated children move from parents.
  - Practical tradeoff: larger values explore more aggressively and can destabilize strong weights.
- `--crossover-rate`
  - Meaning: probability that a child blends two survivor parents instead of mutating one parent.
  - Effect: controls how often survivor weights are combined.
  - Practical tradeoff: crossover can combine useful traits, but mutation is simpler and often steadier.
- `--elite-count`
  - Meaning: number of top survivors copied into the next generation before filling children.
  - Effect: protects the best candidates from being lost.
  - Practical tradeoff: too many elites reduce exploration.
- `--final-gate-games-per-pairing`
  - Meaning: number of final best-candidate games against the incumbent and each baseline in each seat assignment.
  - Effect: controls confidence in the final promotion decision.
  - Practical tradeoff: increase it for serious replacement runs.
- `--minimum-promotion-win-rate`
  - Meaning: minimum candidate win rate across candidate-vs-non-candidate games.
  - Effect: one half of the promotion gate.
  - Practical tradeoff: raise this when you want stronger evidence before replacement.
- `--maximum-promotion-loss-rate`
  - Meaning: maximum candidate loss rate across candidate-vs-non-candidate games.
  - Effect: the second half of the promotion gate.
  - Practical tradeoff: lower this when avoiding regressions matters more than accepting marginal improvements.
- `--report-filename`
  - Meaning: output filename for the evolution report.
  - Effect: changes only the JSON report path in evolution mode.
  - Practical tradeoff: useful when keeping multiple reports in the same output directory.
- `--evolved-artifact-filename`
  - Meaning: output filename for the best evolved artifact.
  - Effect: changes only the evolved artifact path in evolution mode.
  - Practical tradeoff: useful when keeping multiple evolved candidates side by side.

Serialization note:

- generated artifacts now write `trainedAt` as an ISO-8601 string such as `"2026-04-30T12:00:00Z"` so the offline output matches the documented runtime artifact shape.
- generated artifacts must match the runtime `MachineLearnedFeatureEncoder.schemaVersion`; old schema-1 artifacts intentionally fail validation after the phase 3 feature expansion.

## How Position Sampling Works

Candidate positions come from self-play games, not from a separate curated position set.

The generator:

1. builds every ordered dragons-vs-ravens pairing from `selfPlayBotIds`
2. runs each ordered pairing `gamesPerMatchup` times
3. records the snapshot and legal moves at each ply
4. keeps only sampled plies that:
   - have more than one legal move
   - satisfy `plyIndex % sampleStride == 0`
   - fit within `maxSampledPositionsPerGame`

Each surviving sampled position is then labeled by the expert bot:

- the expert chooses one preferred move
- every legal move from that position becomes a training example
- the expert move gets label `1.0`
- all other legal moves get label `0.0`

## Pairings, Seeds, And Duplicates

- The same ordered seat pairing is reused when `gamesPerMatchup` is greater than `1`.
- Seat order matters, so `random` as dragons vs `simple` as ravens is a different pairing from `simple` as dragons vs `random` as ravens.
- Each repeated game gets a different incrementing seed starting from `initialSeed`.
- Today, the seed mostly matters when a matchup includes `random`, because `Randall` is the bot that consumes the seeded random source.
- If a matchup contains only deterministic bots, changing the seed may have little or no effect on the resulting game.
- Repeated `(snapshot, move)` examples are deduplicated after generation so repeated games do not overweight identical candidate moves.

## Recommended First Run

For a first real local candidate, use something modest but larger than the smoke test:

```bash
./gradlew runMachineLearnedTraining -PtrainingArgs='--rule-configuration-id sherwood-rules --expert-bot-id deep-minimax --self-play-bot-ids random,simple,minimax,deep-minimax --games-per-matchup 4 --sample-stride 2 --max-sampled-positions-per-game 8 --max-plies-per-game 300 --initial-seed 1 --output-dir build/machine-learned-candidate'
```

This gives you:

- a generated dataset JSON
- a generated Michelle artifact JSON
- loader validation as part of the CLI run

## Expected Outputs

The command writes two files:

- dataset: `<output-dir>/<ruleConfigurationId>.dataset.json`
- artifact: `<output-dir>/<ruleConfigurationId>.generated.json`

For Sherwood, the defaults are:

- `build/machine-learned-candidate/sherwood-rules.dataset.json`
- `build/machine-learned-candidate/sherwood-rules.generated.json`

The CLI prints the absolute paths after it finishes.

## Validate The Candidate Artifact

At minimum, do these checks after training:

1. Confirm the CLI completed successfully.
2. Confirm the artifact JSON exists.
3. Confirm the artifact says:
   - `botId = machine-learned`
   - `displayName = Michelle`
   - `ruleConfigurationId = sherwood-rules`
   - `featureSchemaVersion = 2`
4. Run the Michelle runtime tests:

```bash
./gradlew test --tests com.ravensanddragons.game.MachineLearnedBotPhaseOneTest
```

If you want a broader safety pass, run:

```bash
./gradlew test
```

To smoke-evaluate Michelle against the baseline bots, run:

```bash
./gradlew botMatchHarnessTest -DbotMatchHarnessGamesPerMatchup=1
```

The current installed artifact was generated from 314 labeled positions across 32 self-play games using `deep-minimax` as the expert.

## Run The Evolution Loop

Before replacing the bundled artifact, evolve a population seeded by the current incumbent and, optionally, the newly trained artifact:

```bash
./gradlew runMachineLearnedTraining -PtrainingArgs='--mode evolve --rule-configuration-id sherwood-rules --incumbent-artifact src/main/resources/bots/machine-learned/sherwood-rules.json --seed-artifact build/machine-learned-candidate/sherwood-rules.generated.json --population-size 24 --survivor-count 6 --generations 20 --games-per-matchup 1 --baseline-bot-ids minimax,deep-minimax --max-plies-per-game 300 --opening-random-plies 2 --mutation-rate 0.15 --mutation-scale 0.10 --crossover-rate 0.50 --elite-count 2 --final-gate-games-per-pairing 4 --minimum-promotion-win-rate 0.55 --maximum-promotion-loss-rate 0.35 --output-dir build/machine-learned-candidate'
```

The evolution command writes:

- best evolved artifact: `<output-dir>/<ruleConfigurationId>.evolved.json`
- report: `<output-dir>/<ruleConfigurationId>.evolution-report.json`

The report includes:

- per-generation candidate scores and survivor ids
- candidate-vs-candidate games in both seats
- candidate-vs-baseline games in both seats
- final best-candidate games against the incumbent and baselines
- a final promotion decision with candidate wins, losses, draws, win rate, loss rate, and reason

Treat the evolved artifact as eligible for installation only when `finalPromotionDecision.promote` is `true`. If the candidate fails the threshold, keep the bundled incumbent and adjust population size, generations, mutation settings, seed artifact quality, or final gate size before trying again.

## Install A New Artifact

The bundled runtime artifact currently lives at:

[`src/main/resources/bots/machine-learned/sherwood-rules.json`](/Users/jrayazian/code/ravens-and-dragons/src/main/resources/bots/machine-learned/sherwood-rules.json)

To install a newly trained Sherwood artifact:

1. Keep a copy of the current bundled artifact.
2. Replace the bundled file with the new generated artifact.
3. Run Michelle loader/runtime tests.
4. Start the app and verify `Michelle` is still available for `Sherwood Rules`.

One straightforward local install flow is:

```bash
cp src/main/resources/bots/machine-learned/sherwood-rules.json build/machine-learned-candidate/sherwood-rules.previous.json
cp build/machine-learned-candidate/sherwood-rules.generated.json src/main/resources/bots/machine-learned/sherwood-rules.json
./gradlew test --tests com.ravensanddragons.game.MachineLearnedBotPhaseOneTest
```

## Roll Back

If the new artifact behaves badly or fails validation, restore the previous JSON:

```bash
cp build/machine-learned-candidate/sherwood-rules.previous.json src/main/resources/bots/machine-learned/sherwood-rules.json
./gradlew test --tests com.ravensanddragons.game.MachineLearnedBotPhaseOneTest
```

## Suggested Manual Evaluation

The evolution report is the main local promotion gate. Manual harness runs are still useful as a broader smoke check before treating a new artifact as the default bundled model.

At minimum, check:

- `Michelle` vs `Randall`
- `Michelle` vs `Simon`
- `Michelle` vs `Maxine`
- `Michelle` vs `Alphie`

The harness command above covers those pairings as Sherwood smoke tests in both seat assignments for the currently installed artifact. It proves completion and basic outcomes, not statistical superiority.

If the artifact fails the evolution threshold or looks worse than the current bundled Sherwood artifact during manual checks, do not install it as the default.

## Troubleshooting

If training fails:

- check that the requested ruleset is supported by both the runtime and training pipeline
- check that the expert bot is valid for that ruleset
- check that the generated artifact still matches the runtime feature-schema and model-format versions
- check that Gradle has permission to use its local wrapper and cache directories

If the app does not show `Michelle` after installation:

- confirm the JSON filename still matches the ruleset, for example `sherwood-rules.json`
- confirm the JSON contents still use `ruleConfigurationId: "sherwood-rules"`
- confirm the artifact passes `MachineLearnedBotPhaseOneTest`

## Summary

Training can begin now for Sherwood-only local candidate artifacts.

The safe loop is:

1. run `runMachineLearnedTraining`
2. inspect the generated artifact
3. validate it with tests
4. run `runMachineLearnedTraining --mode evolve`
5. compare the installed artifact against baseline bots
6. replace the bundled Sherwood artifact only if the evolution report clears promotion
