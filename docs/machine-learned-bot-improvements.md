# Machine-Learned Bot Improvements

This note captures high-leverage changes that can make the evolved `Michelle` bot stronger. It assumes the current implementation remains Kotlin-first, ruleset-scoped, artifact-backed, and cheap enough to run inside the server request path.

## Current Shape

`Michelle` currently uses a schema-versioned linear move ranker. At runtime it:

1. loads a per-ruleset JSON artifact,
2. checks for an immediate winning move,
3. applies each legal move once,
4. encodes move-local and resulting-position features,
5. scores each move with `bias + sum(weight[i] * feature[i])`,
6. chooses the highest-scoring legal move.

The offline pipeline can create supervised seed artifacts from expert-labeled self-play positions and can evolve weight vectors through candidate-only round-robin games followed by survivor comparison against the incumbent and configured baselines.

## Biggest Opportunities

### Use Michelle As A Search Evaluator

The largest single runtime improvement is likely to make Michelle evaluate leaves inside a shallow alpha-beta search instead of scoring only one-ply candidate moves. Search would handle short tactics, forced replies, and traps, while the learned model would judge the resulting positions.

This preserves the current artifact idea but gives evolution a better tactical engine. The first version can stay conservative:

- keep the existing immediate-win shortcut,
- search a small fixed depth,
- reuse canonical legal-move generation and `BotStrategySupport.applyMove`,
- use Michelle's score at leaf nodes,
- keep deterministic tie-breaking.

### Add Stronger And More Diverse Fitness Pressure

Generation selection currently rewards candidate-vs-candidate results. That is useful for open-ended exploration, but it can produce candidates that mostly exploit the current population. Add some baseline pressure during generation, or alternate generations between candidate-only leagues and candidate-vs-baseline leagues.

Useful opponents include:

- the incumbent Michelle,
- recent promoted or high-performing historical Michelle artifacts,
- `Maxine`,
- `Alphie`,
- supervised seed artifacts with different data settings.

Baselines should still be used carefully so evolution does not overfit to one search bot's quirks.

### Improve Fitness Beyond Win/Loss/Draw

The evolution score can become more informative by adding shaped signals from each finished game. This helps when many games draw or when candidates are close in strength.

Candidate fitness can reward:

- faster wins,
- slower losses,
- material advantage at draws,
- gold progress for dragons,
- raven pressure and gold containment for ravens,
- avoiding opponent immediate-win positions,
- reducing opponent capture threats,
- keeping legal mobility when ahead.

These signals should be secondary to actual results so the evolved bot does not learn to optimize pretty-looking losses.

### Learn From Outcomes, Not Only Expert Imitation

The supervised trainer currently learns to rank an expert-selected move above alternatives from the same position. That is a good seed, but it teaches Michelle to imitate a search bot. Add outcome-based self-play examples where moves receive value from the eventual game result, possibly discounted by ply distance.

A practical path:

- keep expert imitation for initial seeds,
- generate Michelle-vs-baseline and Michelle-vs-Michelle games,
- label sampled positions by eventual winner/draw and side to move,
- train a value-oriented artifact or mix value-derived ranking examples into the current trainer.

This gives Michelle a chance to discover strategies that are not simply copies of `deep-minimax`.

### Support A Richer Model Shape

The linear ranker is easy to evolve and cheap to serve, but many game concepts are conditional. Gold mobility matters differently depending on raven pressure, material, side, and distance to corners.

Two incremental options:

- add explicit interaction features while keeping a linear model,
- bump the artifact format to support a tiny multilayer perceptron.

Interaction features are easier to inspect and evolve. A tiny neural model may learn better combinations but needs stricter artifact validation, runtime tests, and performance checks.

### Specialize By Side Or Game Stage

The current encoder flips relative features for raven turns so one weight vector can serve both sides. That keeps artifacts compact, but dragons and ravens have asymmetric goals. Stronger artifacts may use:

- separate dragon and raven weights,
- separate early, middle, and late-game weights,
- separate move-ranking and position-value heads.

Side-specific weights are the simplest major specialization and fit the current artifact-backed runtime well.

### Improve Opening Diversity And Evaluation Reliability

Evolution already supports randomized opening plies. Promotion decisions would be more reliable with fixed opening suites and repeated seed schedules. Each candidate should face a comparable range of positions, from both seats, across the same deterministic seed set.

This reduces lucky promotions and makes reports easier to compare between runs.

### Use Rating-Based Survivor Selection

Raw round-robin scores are simple, but an Elo or TrueSkill-style rating can better handle noisy match results and uneven confidence. Ratings would be especially useful once generation fitness includes a mixture of candidates, baselines, incumbents, and historical artifacts.

The evolution report should keep enough detail to explain why a candidate survived or promoted.

## Recommended Sequence

1. Improve evaluation reliability first: fixed seed suites, stronger reports, and shaped fitness.
2. Add shallow search around Michelle using the current artifact scorer as the leaf evaluator.
3. Introduce side-specific weights or interaction features.
4. Add outcome-based self-play training data.
5. Consider a tiny nonlinear model only after the improved linear/search version plateaus.

The highest-impact single implementation is the shallow search wrapper. It changes runtime strength without discarding the existing training pipeline, artifact format, or feature encoder.
