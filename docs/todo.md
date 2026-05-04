# Todo

This file is the canonical list of planned work that is not being implemented immediately. Keep each item issue-tracker-like, link any backing plan files, and remove completed items plus obsolete backing plan files when the work is done.

## Separate Frontend And Backend Test Tasks

- **Goal:** Make JVM tests and frontend tests separate Gradle tasks and choose whether root `test` or root `check` aggregates the full suite.
- **Why:** Filtered backend test runs should not accidentally run frontend tests, and multi-project test ownership needs to be explicit before the module split.
- **Notes:** Preserve the ability to run filtered Kotlin tests without running frontend tests.
- **References:** [docs/multi-game-service-structure-plan.md](/Users/jrayazian/code/ravens-and-dragons/docs/multi-game-service-structure-plan.md).

## Introduce Top-Level Service Subprojects

- **Goal:** Create `platform/`, `ravens-and-dragons/`, and `app/` Gradle projects without behavior changes.
- **Why:** These projects make the shared platform, game module, and runnable assembled app boundaries visible.
- **Notes:** Move files mechanically, keep package names stable at first where practical, and wire `app` to produce the same Spring Boot jar.
- **References:** [docs/multi-game-service-structure-plan.md](/Users/jrayazian/code/ravens-and-dragons/docs/multi-game-service-structure-plan.md).

## Move Obvious Platform Code Out Of The Game Module

- **Goal:** Move auth, OAuth provider metadata, generic web exception handling, and route fallback behavior into `platform/`.
- **Why:** Shared service concerns should not remain tangled with Ravens and Dragons-specific rules, bots, board helpers, and UI.
- **Notes:** Keep canonical Ravens and Dragons gameplay logic in the game module.
- **References:** [docs/multi-game-service-structure-plan.md](/Users/jrayazian/code/ravens-and-dragons/docs/multi-game-service-structure-plan.md).

## Define The First Game Module Contract

- **Goal:** Define the minimal adapter contract between `platform/`, `app/`, and each game module.
- **Why:** A small contract is needed before adding another game so routing, commands, persistence, seats, frontend metadata, static assets, migrations, and smoke tests have clear ownership.
- **Notes:** Extract the first version from real `ravens-and-dragons` needs instead of hypothetical game mechanics.
- **References:** [docs/multi-game-service-structure-plan.md](/Users/jrayazian/code/ravens-and-dragons/docs/multi-game-service-structure-plan.md).

## Add Game Identity To Routes And Persistence

- **Goal:** Add game slug handling at API, browser route, and database boundaries.
- **Why:** A multi-game service needs to distinguish the hosting service's session id from the type of game being played.
- **Notes:** Decide how long compatibility routes like `/g/{gameId}` should remain.
- **References:** [docs/multi-game-service-structure-plan.md](/Users/jrayazian/code/ravens-and-dragons/docs/multi-game-service-structure-plan.md).

## Prepare Ravens And Dragons For External Game Repos

- **Goal:** Make `ravens-and-dragons` buildable and testable as an independent Gradle project and keep the app's included-game list declarative.
- **Why:** A game module should be able to stay top-level locally or move to another repository later without changing the service boundary.
- **Notes:** Decide later between composite builds, published artifacts, or source checkouts for external games.
- **References:** [docs/multi-game-service-structure-plan.md](/Users/jrayazian/code/ravens-and-dragons/docs/multi-game-service-structure-plan.md).

## Fix Board Edge And Square Sizing

- **Goal:** Review board layout sizing so the board edges and playable squares align cleanly at supported viewport sizes, including fullscreen.
- **Why:** Board geometry problems are highly visible during play and can make interactions feel imprecise.
- **Notes:** Preserve the current board visual language and responsive behavior while tightening the geometry.

## Add Game Skins

- **Goal:** Allow alternate visual skins for the game board and pieces.
- **Why:** Skins would let the game support alternate themes without changing rules or core play flow.
- **Notes:** Treat this as a UI feature unless a future skin requires rules-specific metadata. Preserve existing gameplay behavior.

## Use Michelle As A Search Evaluator

- **Goal:** Add a shallow alpha-beta search wrapper that uses the existing Michelle artifact scorer as the leaf evaluator.
- **Why:** Search would help Michelle handle short tactics, forced replies, and traps without discarding the existing artifact format or training pipeline.
- **Notes:** Keep the existing immediate-win shortcut, use canonical Kotlin legal-move generation, and preserve deterministic tie-breaking.
- **References:** [docs/machine-trained-bot-improvements.md](/Users/jrayazian/code/ravens-and-dragons/docs/machine-trained-bot-improvements.md).

## Add Stronger And More Diverse Michelle Fitness Pressure

- **Goal:** Add baseline pressure during generation or alternate generations between candidate-only and candidate-vs-baseline leagues.
- **Why:** Candidate-only leagues can produce bots that mostly exploit the current population instead of improving against stronger external opponents.
- **Notes:** Useful baselines include the incumbent Michelle, historical Michelle artifacts, `Maxine`, `Alphie`, and supervised seed artifacts with different data settings.
- **References:** [docs/machine-trained-bot-improvements.md](/Users/jrayazian/code/ravens-and-dragons/docs/machine-trained-bot-improvements.md).

## Improve Michelle Fitness Beyond Win Loss Draw

- **Goal:** Add secondary shaped signals to evolution scoring, such as faster wins, slower losses, material at draws, gold progress, containment, threat reduction, and mobility while ahead.
- **Why:** Richer fitness signals can distinguish close candidates when many games draw or produce similar match results.
- **Notes:** Keep actual game results primary so candidates do not learn to optimize good-looking losses.
- **References:** [docs/machine-trained-bot-improvements.md](/Users/jrayazian/code/ravens-and-dragons/docs/machine-trained-bot-improvements.md).

## Teach Michelle From Outcomes

- **Goal:** Add outcome-based self-play examples where moves receive value from the eventual result, possibly discounted by ply distance.
- **Why:** Expert imitation is a useful seed, but outcome learning gives Michelle a path to discover strategies that are not just copies of search-bot choices.
- **Notes:** Keep expert imitation for initial seeds, then mix in value-derived ranking examples or a value-oriented artifact.
- **References:** [docs/machine-trained-bot-improvements.md](/Users/jrayazian/code/ravens-and-dragons/docs/machine-trained-bot-improvements.md).

## Support A Richer Michelle Model Shape

- **Goal:** Add interaction features to the current linear model or eventually support a tiny multilayer perceptron artifact.
- **Why:** Some board concepts are conditional, and a purely linear ranker may not capture those interactions well.
- **Notes:** Prefer explicit interaction features first because they are easier to inspect and evolve.
- **References:** [docs/machine-trained-bot-improvements.md](/Users/jrayazian/code/ravens-and-dragons/docs/machine-trained-bot-improvements.md).

## Specialize Michelle By Game Stage

- **Goal:** Add early, middle, and late-game specialization through separate weights, separate heads, or explicit phase/context features.
- **Why:** The same board fact can mean different things in openings, containment fights, and nearly-terminal escapes.
- **Notes:** Build on schema 5's existing side-specific dragon and raven vectors.
- **References:** [docs/machine-trained-bot-improvements.md](/Users/jrayazian/code/ravens-and-dragons/docs/machine-trained-bot-improvements.md).

## Improve Michelle Opening Diversity And Evaluation Reliability

- **Goal:** Use fixed opening suites and repeated seed schedules so candidate evaluations cover comparable positions from both seats.
- **Why:** More reliable promotion tests reduce lucky promotions and make reports easier to compare between runs.
- **Notes:** This pairs well with stronger reports and shaped fitness.
- **References:** [docs/machine-trained-bot-improvements.md](/Users/jrayazian/code/ravens-and-dragons/docs/machine-trained-bot-improvements.md).

## Use Rating-Based Michelle Survivor Selection

- **Goal:** Evaluate survivors with an Elo or TrueSkill-style rating instead of only raw round-robin scores.
- **Why:** Ratings can better handle noisy match results and uneven confidence once candidates, baselines, incumbents, and historical artifacts all appear in evaluation.
- **Notes:** Reports should still explain why each candidate survived or promoted.
- **References:** [docs/machine-trained-bot-improvements.md](/Users/jrayazian/code/ravens-and-dragons/docs/machine-trained-bot-improvements.md).

## Change Package Path

- **Goal:** Rename the Kotlin package path to match the intended long-term project or module structure.
- **Why:** The current package path uses a top-level domain that I do not own.
- **Notes:** Coordinate this with the multi-game structure plan if the package rename is part of the same modularization work.
