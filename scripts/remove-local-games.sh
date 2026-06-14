#!/usr/bin/env bash
set -euo pipefail

usage() {
    cat <<'USAGE'
Usage: scripts/remove-local-games.sh [game-slug]

Deletes games from the local H2 database.

Arguments:
  game-slug    Optional. Delete only games with this game_slug.
               If omitted, delete all local games.

Environment:
  LOCAL_GAME_DB_PATH  H2 file database path without .mv.db suffix.
                      Default: build/db/ravens-and-dragons
  H2_JAR              Path to h2-*.jar. Auto-detected from Gradle cache by default.
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
    usage
    exit 0
fi

if [[ "$#" -gt 1 ]]; then
    usage >&2
    exit 2
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
db_path="${LOCAL_GAME_DB_PATH:-"$repo_root/build/db/ravens-and-dragons"}"
db_file="$db_path.mv.db"
slug="${1:-}"

if [[ -n "$slug" && ! "$slug" =~ ^[A-Za-z0-9_-]+$ ]]; then
    echo "Game slug may contain only letters, numbers, underscores, and hyphens: $slug" >&2
    exit 2
fi

if [[ ! -f "$db_file" ]]; then
    echo "Local H2 database not found: $db_file" >&2
    exit 1
fi

if [[ -n "${H2_JAR:-}" ]]; then
    h2_jar="$H2_JAR"
else
    h2_jar="$(
        find "$HOME/.gradle/caches/modules-2/files-2.1" "$repo_root/build" \
            -path '*com.h2database/h2/*/h2-*.jar' \
            ! -name '*sources.jar' \
            -print 2>/dev/null | sort | tail -n 1
    )"
fi

if [[ -z "${h2_jar:-}" || ! -f "$h2_jar" ]]; then
    echo "Could not find h2-*.jar. Run ./gradlew :app:backend:test or set H2_JAR." >&2
    exit 1
fi

where_clause=""
description="all games"
if [[ -n "$slug" ]]; then
    where_clause=" where game_slug = '$slug'"
    description="games with slug '$slug'"
fi

jdbc_url="jdbc:h2:file:$db_path;MODE=PostgreSQL"
sql="select count(*) as matching_games from games$where_clause; delete from games$where_clause; select count(*) as remaining_games from games;"

echo "Deleting $description from $db_file"
java -cp "$h2_jar" org.h2.tools.Shell \
    -url "$jdbc_url" \
    -user sa \
    -password '' \
    -sql "$sql"
