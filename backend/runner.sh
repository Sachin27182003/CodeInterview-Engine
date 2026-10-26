#!/bin/sh
set -eu

language="${1:-}"

run_with_timeout() {
  exec timeout 5s "$@"
}

case "$language" in
  javascript)
    run_with_timeout node --input-type=commonjs -
    ;;
  python)
    run_with_timeout python3 -
    ;;
  java)
    cat > /run/code/Main.java
    javac -encoding UTF-8 -d /run/code /run/code/Main.java
    run_with_timeout java -cp /run/code Main
    ;;
  c)
    cat > /run/code/main.c
    gcc -std=c17 -O2 -Wall -Wextra -o /run/code/main /run/code/main.c
    run_with_timeout /run/code/main
    ;;
  cpp)
    cat > /run/code/main.cpp
    g++ -std=c++17 -O2 -Wall -Wextra -o /run/code/main /run/code/main.cpp
    run_with_timeout /run/code/main
    ;;
  *)
    printf 'Unsupported language\n' >&2
    exit 2
    ;;
esac
