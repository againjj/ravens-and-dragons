# Machine-Learned Bot Training Runbook

This runbook describes how to train and install a new `Michelle` artifact with the current Kotlin-first offline pipeline.

## Should We Train Now?

Yes, for an initial local training run.

The phase 2 pipeline is now in place:

- Gradle exposes `runMachineLearnedTraining`
- the offline training code can generate a Sherwood-only dataset
- the trainer can export a runtime-compatible JSON artifact
- the artifact can be loaded back through the runtime validation rules

What this means in practice:

- we can generate a new local `Michelle` artifact now
- this is appropriate for a first candidate artifact or an iteration artifact
- this is not yet the full phase 4 promotion workflow with incumbent-vs-candidate league gating

If the goal is “produce a new artifact and try it locally,” training can begin now.

If the goal is “replace the bundled artifact with a clearly stronger model,” you should still plan to do evaluation after training, because the current pipeline does not yet automate promotion thresholds.

## Current Scope

The current training pipeline is intentionally narrow:

- ruleset: `sherwood-rules`
- runtime bot id: `machine-learned`
- display name: `Michelle`
- artifact format: JSON
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

By default it trains a Sherwood artifact, uses all available CPUs for per-game dataset generation work, and writes outputs under `build/machine-learned`.

Example:

```bash
./gradlew runMachineLearnedTraining -PtrainingArgs='--rule-configuration-id sherwood-rules --expert-bot-id deep-minimax --self-play-bot-ids random,simple,minimax,deep-minimax --games-per-matchup 2 --sample-stride 2 --max-sampled-positions-per-game 8 --max-plies-per-game 300 --initial-seed 1 --output-dir build/machine-learned'
```

## Training Arguments

The CLI currently supports these arguments:

- `--rule-configuration-id`
- `--expert-bot-id`
- `--self-play-bot-ids`
- `--games-per-matchup`
- `--sample-stride`
- `--max-sampled-positions-per-game`
- `--max-plies-per-game`
- `--initial-seed`
- `--worker-count`
- `--output-dir`
- `--dataset-filename`
- `--artifact-filename`

Notes:

- `--self-play-bot-ids` is a comma-separated list such as `random,simple,minimax,deep-minimax`.
- `--rule-configuration-id` should stay `sherwood-rules` unless the runtime and training work have both been extended for another ruleset.
- larger `games-per-matchup` values produce bigger datasets and longer runs.
- if `--worker-count` is omitted, the CLI uses `Runtime.getRuntime().availableProcessors()`.

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

- `build/machine-learned/sherwood-rules.dataset.json`
- `build/machine-learned/sherwood-rules.generated.json`

The CLI prints the absolute paths after it finishes.

## Validate The Candidate Artifact

At minimum, do these checks after training:

1. Confirm the CLI completed successfully.
2. Confirm the artifact JSON exists.
3. Confirm the artifact says:
   - `botId = machine-learned`
   - `displayName = Michelle`
   - `ruleConfigurationId = sherwood-rules`
4. Run the Michelle runtime tests:

```bash
./gradlew test --tests com.ravensanddragons.game.MachineLearnedBotPhaseOneTest
```

If you want a broader safety pass, run:

```bash
./gradlew test
```

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
cp src/main/resources/bots/machine-learned/sherwood-rules.json build/machine-learned/sherwood-rules.previous.json
cp build/machine-learned-candidate/sherwood-rules.generated.json src/main/resources/bots/machine-learned/sherwood-rules.json
./gradlew test --tests com.ravensanddragons.game.MachineLearnedBotPhaseOneTest
```

## Roll Back

If the new artifact behaves badly or fails validation, restore the previous JSON:

```bash
cp build/machine-learned/sherwood-rules.previous.json src/main/resources/bots/machine-learned/sherwood-rules.json
./gradlew test --tests com.ravensanddragons.game.MachineLearnedBotPhaseOneTest
```

## Suggested Manual Evaluation

The current pipeline can create artifacts, but it does not yet auto-promote them. Before treating a new artifact as the default bundled model, compare it manually against existing bots.

At minimum, check:

- `Michelle` vs `Randall`
- `Michelle` vs `Simon`
- `Michelle` vs `Maxine`
- `Michelle` vs `Alphie`

If the artifact looks worse than the current bundled Sherwood artifact, do not install it as the default.

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
4. compare it against baseline bots
5. replace the bundled Sherwood artifact only if it looks like an improvement
