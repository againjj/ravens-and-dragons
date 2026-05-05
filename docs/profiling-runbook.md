# Profiling Runbook

This runbook captures the repeatable memory-profiling flow used for the first runtime-memory pass on the local app.

## Goals

- Measure retained heap at idle.
- Measure retained heap after a human-only gameplay batch.
- Measure retained heap and allocation pressure after a bot gameplay batch.
- Measure stream-related retention with live SSE clients attached.

## Prerequisites

- A local `.env.local` file.
- The JDK `jcmd` tool available on the machine.
- The JDK `jfr` CLI available at:

```bash
/Library/Java/JavaVirtualMachines/jdk-25.jdk/Contents/Home/bin/jfr
```

- Local output directory:

```bash
mkdir -p /tmp/rad-profile-first-run
```

## Start The App

Load local env vars and start the app:

```bash
set -a
source .env.local
set +a
./gradlew bootRun
```

Confirm the app is healthy:

```bash
curl -sf http://127.0.0.1:8080/health
```

Find the app JVM pid:

```bash
jcmd | rg 'RavensAndDragonsApplication|gradlew bootRun|ravens-and-dragons'
```

## Temporary Load Driver

The first run used a temporary local script at:

```text
/tmp/rad-profile-first-run/first-run-load.mjs
```

It supports:

- `human <games> <movesPerGame>`
- `bot <games> <exchangesPerGame> <botId>`

The script:

- signs in as a guest user
- creates games through the live HTTP API
- claims seats
- plays moves
- automatically issues `skip-capture` until the game returns to move phase

If the script is missing, recreate it from the profiling notes before rerunning this exact flow.

## Idle Baseline

Start a short JFR recording, then force GC and capture heap snapshots:

```bash
jcmd <pid> JFR.start name=baseline settings=profile duration=15s filename=/tmp/rad-profile-first-run/baseline.jfr
sleep 16
jcmd <pid> GC.run
jcmd <pid> GC.heap_info > /tmp/rad-profile-first-run/baseline.heap.txt
jcmd <pid> GC.class_histogram > /tmp/rad-profile-first-run/baseline.hist.txt
jcmd <pid> VM.native_memory summary > /tmp/rad-profile-first-run/baseline.nmt.txt || true
```

## Human Retention Batch

Run a human-only gameplay batch and capture JFR plus post-GC snapshots:

```bash
jcmd <pid> JFR.start name=human50 settings=profile duration=30s filename=/tmp/rad-profile-first-run/human50.jfr
node /tmp/rad-profile-first-run/first-run-load.mjs human 50 10 > /tmp/rad-profile-first-run/human50.load.json
sleep 2
jcmd <pid> GC.run
jcmd <pid> GC.heap_info > /tmp/rad-profile-first-run/human50.heap.txt
jcmd <pid> GC.class_histogram > /tmp/rad-profile-first-run/human50.hist.txt
```

## Bot Batch

Use a bounded bot run for a quick regression pass:

```bash
jcmd <pid> JFR.start name=bot3x2 settings=profile duration=30s filename=/tmp/rad-profile-first-run/bot3x2.jfr
node /tmp/rad-profile-first-run/first-run-load.mjs bot 3 2 minimax > /tmp/rad-profile-first-run/bot3x2.load.json
sleep 2
jcmd <pid> GC.run
jcmd <pid> GC.heap_info > /tmp/rad-profile-first-run/bot3x2.heap.txt
jcmd <pid> GC.class_histogram > /tmp/rad-profile-first-run/bot3x2.hist.txt
```

Notes:

- Larger bot batches can be useful for deeper JFR analysis, but they may run long enough to be inconvenient for quick regression checks.
- If you need a deeper bot sample, use a separate artifact name and expect a much larger recording.

## SSE Pass

Create an authenticated guest session and a real game:

```bash
COOKIE=/tmp/rad-profile-first-run/sse.cookies
rm -f "$COOKIE"
curl -s -c "$COOKIE" -X POST http://127.0.0.1:8080/api/auth/guest >/dev/null
CREATE=$(curl -s -b "$COOKIE" -c "$COOKIE" -H 'Content-Type: application/json' -d '{"startingSide":"dragons","board":{"a1":"dragon","g7":"raven"}}' http://127.0.0.1:8080/api/games/ravens-and-dragons)
GAME_ID=$(printf '%s' "$CREATE" | jq -r '.game.id')
curl -s -b "$COOKIE" -c "$COOKIE" -H 'Content-Type: application/json' -d '{"side":"dragons"}' "http://127.0.0.1:8080/api/games/$GAME_ID/claim-side" >/dev/null
curl -s -b "$COOKIE" -c "$COOKIE" -H 'Content-Type: application/json' -d '{"side":"ravens"}' "http://127.0.0.1:8080/api/games/$GAME_ID/claim-side" >/dev/null
```

Open two authenticated SSE clients in separate terminals:

```bash
curl -Ns -b /tmp/rad-profile-first-run/sse.cookies http://127.0.0.1:8080/api/games/$GAME_ID/stream > /tmp/rad-profile-first-run/sse-stream-1.log
```

```bash
curl -Ns -b /tmp/rad-profile-first-run/sse.cookies http://127.0.0.1:8080/api/games/$GAME_ID/stream > /tmp/rad-profile-first-run/sse-stream-2.log
```

While the streams are attached, capture JFR and a post-GC histogram after a few live moves:

```bash
jcmd <pid> JFR.start name=sse2 settings=profile duration=20s filename=/tmp/rad-profile-first-run/sse2.jfr
```

Then drive a few moves against the same game and capture:

```bash
jcmd <pid> GC.run
jcmd <pid> GC.class_histogram > /tmp/rad-profile-first-run/sse2.hist.txt
```

When finished, close the stream clients.

## Artifact Review

Useful artifacts:

- `/tmp/rad-profile-first-run/baseline.jfr`
- `/tmp/rad-profile-first-run/human50.jfr`
- `/tmp/rad-profile-first-run/bot3x2.jfr`
- `/tmp/rad-profile-first-run/sse2.jfr`
- `/tmp/rad-profile-first-run/*.heap.txt`
- `/tmp/rad-profile-first-run/*.hist.txt`

Open recordings in JDK Mission Control or inspect from the command line:

```bash
"/Library/Java/JavaVirtualMachines/jdk-25.jdk/Contents/Home/bin/jfr" summary /tmp/rad-profile-first-run/bot3x2.jfr
```

```bash
"/Library/Java/JavaVirtualMachines/jdk-25.jdk/Contents/Home/bin/jfr" print --events jdk.ObjectAllocationSample /tmp/rad-profile-first-run/bot3x2.jfr
```

## Known Caveats

- `VM.native_memory summary` returns nothing useful unless the JVM was started with Native Memory Tracking enabled.
- First-request classloading can contaminate allocation samples if the recording starts too early.
- H2 MVStore background work and JSON decode/encode activity show up prominently in allocation samples, so not every hot allocation in the recording is gameplay logic.
