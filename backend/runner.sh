#!/bin/sh
set -eu

language="${1:-}"
problem="${2:-}"

case "$problem:$language" in
  two-sum:*|frontend-state-updates:javascript|frontend-state-updates:python|frontend-render-window:javascript|frontend-render-window:python|backend-concurrency-window:javascript|backend-concurrency-window:python|backend-rate-limiter:javascript|backend-rate-limiter:python|indexed-log-search:javascript|indexed-log-search:python|retry-budget:javascript|retry-budget:python|data-deduplicate-events:javascript|data-deduplicate-events:python|security-audit-log:javascript|security-audit-log:python)
    ;;
  *)
    printf 'Unsupported problem/language combination: %s/%s\n' "$problem" "$language" >&2
    exit 2
    ;;
esac

run_with_timeout() {
  exec timeout 5s "$@"
}

case "$language" in
  javascript)
    {
      cat
      case "$problem" in
        two-sum)
          cat <<'EOF'

const tests = [
  [[2, 7, 11, 15], 9, [0, 1]],
  [[3, 2, 4], 6, [1, 2]],
  [[-3, 4, 3, 90], 0, [0, 2]],
  [[1, 5, 3, 7, 9], 12, [1, 3]],
];
for (const [nums, target, expected] of tests) {
  const actual = twoSum(nums, target);
  if (!Array.isArray(actual) || actual.length !== 2 ||
      actual[0] !== expected[0] || actual[1] !== expected[1]) {
    throw new Error(`Test failed for ${JSON.stringify(nums)}, ${target}: expected ${expected}, got ${actual}`);
  }
}
console.log(`Passed ${tests.length}/${tests.length} tests`);
EOF
          ;;
        frontend-state-updates)
          cat <<'EOF'

const tests = [
  [{ count: 0, theme: "light" }, [{ count: 1 }, { theme: "dark" }], { count: 1, theme: "dark" }],
  [{ ready: false }, [{ ready: true }, { count: 2 }], { ready: true, count: 2 }],
];
for (const [initial, updates, expected] of tests) {
  const original = JSON.stringify(initial);
  const actual = applyUpdates(initial, updates);
  if (JSON.stringify(actual) !== JSON.stringify(expected) || JSON.stringify(initial) !== original) {
    throw new Error(`Test failed: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
console.log(`Passed ${tests.length}/${tests.length} tests`);
EOF
          ;;
        frontend-render-window)
          cat <<'EOF'

const tests = [
  [[10, 20, 30], 25, 0, [0, 1]],
  [[10, 10, 10], 10, 15, [1, 2]],
];
for (const [heights, viewport, offset, expected] of tests) {
  const actual = visibleWindow(heights, viewport, offset);
  if (!Array.isArray(actual) || actual[0] !== expected[0] || actual[1] !== expected[1]) {
    throw new Error(`Test failed: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
console.log(`Passed ${tests.length}/${tests.length} tests`);
EOF
          ;;
        backend-concurrency-window)
          cat <<'EOF'
const tests = [
  [[[1, 4], [2, 5], [7, 9]], 2],
  [[[1, 2], [2, 3]], 1],
  [[], 0],
  [[[3, 8], [3, 5], [3, 4]], 3],
];
for (const [intervals, expected] of tests) {
  const actual = maxConcurrency(intervals);
  if (actual !== expected) throw new Error(`Expected ${expected}, got ${actual}`);
}
console.log(`Passed ${tests.length}/${tests.length} tests`);
EOF
          ;;
        backend-rate-limiter)
          cat <<'EOF'
const tests = [
  [[100, 200, 300], 2, 150, [true, true, true]],
  [[100, 110, 120], 2, 50, [true, true, false]],
  [[], 1, 10, []],
  [[0, 10, 20], 1, 10, [true, true, true]],
];
for (const [timestamps, limit, windowMs, expected] of tests) {
  const actual = allowRequests(timestamps, limit, windowMs);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
console.log(`Passed ${tests.length}/${tests.length} tests`);
EOF
          ;;
        indexed-log-search)
          cat <<'EOF'
const tests = [
  [[1, 3, 5, 7], 4, 2],
  [[1, 3, 5], 5, 2],
  [[], 3, 0],
  [[2, 2, 2, 4], 2, 0],
  [[1, 3, 5], 9, 3],
];
for (const [timestamps, target, expected] of tests) {
  const actual = insertionIndex(timestamps, target);
  if (actual !== expected) throw new Error(`Expected ${expected}, got ${actual}`);
}
console.log(`Passed ${tests.length}/${tests.length} tests`);
EOF
          ;;
        retry-budget)
          cat <<'EOF'
const tests = [
  [["failed", "failed", "success"], 2, true],
  [["failed", "failed", "failed", "success"], 2, false],
  [["success", "failed"], 0, true],
  [["failed", "success"], 1, true],
  [["failed", "failed"], 2, false],
];
for (const [attempts, retries, expected] of tests) {
  const actual = withinRetryBudget(attempts, retries);
  if (actual !== expected) throw new Error(`Expected ${expected}, got ${actual}`);
}
console.log(`Passed ${tests.length}/${tests.length} tests`);
EOF
          ;;
        data-deduplicate-events)
          cat <<'EOF'
const tests = [
  [[{id:"a",value:1},{id:"b",value:2},{id:"a",value:3}], [{id:"a",value:1},{id:"b",value:2}]],
  [[], []],
  [[{id:"x",value:1}], [{id:"x",value:1}]],
  [[{id:"a",value:1},{id:"a",value:2},{id:"a",value:3}], [{id:"a",value:1}]],
];
for (const [events, expected] of tests) {
  const original = JSON.stringify(events);
  const actual = deduplicateEvents(events);
  if (JSON.stringify(actual) !== JSON.stringify(expected) || JSON.stringify(events) !== original) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
console.log(`Passed ${tests.length}/${tests.length} tests`);
EOF
          ;;
        security-audit-log)
          cat <<'EOF'
const tests = [
  [[{actor:"service",action:"read"},{actor:"guest",action:"delete"}], ["service"], [1]],
  [[], ["admin"], []],
  [[{actor:"admin",action:"write"},{actor:"Admin",action:"read"},{actor:"guest",action:"delete"}], ["admin"], [1,2]],
  [[{actor:"guest",action:"read"}], [], [0]],
];
for (const [events, allowedActors, expected] of tests) {
  const actual = unauthorizedIndexes(events, allowedActors);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
console.log(`Passed ${tests.length}/${tests.length} tests`);
EOF
          ;;
        *)
          printf 'Unsupported executable problem: %s\n' "$problem" >&2
          exit 2
          ;;
      esac
    } | run_with_timeout node --input-type=commonjs -
    ;;
  python)
    {
      cat
      case "$problem" in
        two-sum)
          cat <<'EOF'

tests = [
    ([2, 7, 11, 15], 9, [0, 1]),
    ([3, 2, 4], 6, [1, 2]),
    ([-3, 4, 3, 90], 0, [0, 2]),
    ([1, 5, 3, 7, 9], 12, [1, 3]),
]
for nums, target, expected in tests:
    actual = two_sum(nums, target)
    if actual != expected:
        raise AssertionError(f"Test failed for {nums}, {target}: expected {expected}, got {actual}")
print(f"Passed {len(tests)}/{len(tests)} tests")
EOF
          ;;
        frontend-state-updates)
          cat <<'EOF'

tests = [
    ({"count": 0, "theme": "light"}, [{"count": 1}, {"theme": "dark"}], {"count": 1, "theme": "dark"}),
    ({"ready": False}, [{"ready": True}, {"count": 2}], {"ready": True, "count": 2}),
]
for initial, updates, expected in tests:
    original = initial.copy()
    actual = apply_updates(initial, updates)
    if actual != expected or initial != original:
        raise AssertionError(f"Test failed: expected {expected}, got {actual}")
print(f"Passed {len(tests)}/{len(tests)} tests")
EOF
          ;;
        frontend-render-window)
          cat <<'EOF'

tests = [
    ([10, 20, 30], 25, 0, [0, 1]),
    ([10, 10, 10], 10, 15, [1, 2]),
]
for heights, viewport, offset, expected in tests:
    actual = visible_window(heights, viewport, offset)
    if actual != expected:
        raise AssertionError(f"Test failed: expected {expected}, got {actual}")
print(f"Passed {len(tests)}/{len(tests)} tests")
EOF
          ;;
        backend-concurrency-window)
          cat <<'EOF'
tests = [
    ([[1, 4], [2, 5], [7, 9]], 2),
    ([[1, 2], [2, 3]], 1),
    ([], 0),
    ([[3, 8], [3, 5], [3, 4]], 3),
]
for intervals, expected in tests:
    actual = max_concurrency(intervals)
    if actual != expected:
        raise AssertionError(f"Expected {expected}, got {actual}")
print(f"Passed {len(tests)}/{len(tests)} tests")
EOF
          ;;
        backend-rate-limiter)
          cat <<'EOF'
tests = [
    ([100, 200, 300], 2, 150, [True, True, True]),
    ([100, 110, 120], 2, 50, [True, True, False]),
    ([], 1, 10, []),
    ([0, 10, 20], 1, 10, [True, True, True]),
]
for timestamps, limit, window_ms, expected in tests:
    actual = allow_requests(timestamps, limit, window_ms)
    if actual != expected:
        raise AssertionError(f"Expected {expected}, got {actual}")
print(f"Passed {len(tests)}/{len(tests)} tests")
EOF
          ;;
        indexed-log-search)
          cat <<'EOF'
tests = [
    ([1, 3, 5, 7], 4, 2),
    ([1, 3, 5], 5, 2),
    ([], 3, 0),
    ([2, 2, 2, 4], 2, 0),
    ([1, 3, 5], 9, 3),
]
for timestamps, target, expected in tests:
    actual = insertion_index(timestamps, target)
    if actual != expected:
        raise AssertionError(f"Expected {expected}, got {actual}")
print(f"Passed {len(tests)}/{len(tests)} tests")
EOF
          ;;
        retry-budget)
          cat <<'EOF'
tests = [
    (["failed", "failed", "success"], 2, True),
    (["failed", "failed", "failed", "success"], 2, False),
    (["success", "failed"], 0, True),
    (["failed", "success"], 1, True),
    (["failed", "failed"], 2, False),
]
for attempts, retries, expected in tests:
    actual = within_retry_budget(attempts, retries)
    if actual != expected:
        raise AssertionError(f"Expected {expected}, got {actual}")
print(f"Passed {len(tests)}/{len(tests)} tests")
EOF
          ;;
        data-deduplicate-events)
          cat <<'EOF'
tests = [
    ([{"id": "a", "value": 1}, {"id": "b", "value": 2}, {"id": "a", "value": 3}], [{"id": "a", "value": 1}, {"id": "b", "value": 2}]),
    ([], []),
    ([{"id": "x", "value": 1}], [{"id": "x", "value": 1}]),
    ([{"id": "a", "value": 1}, {"id": "a", "value": 2}, {"id": "a", "value": 3}], [{"id": "a", "value": 1}]),
]
for events, expected in tests:
    original = [event.copy() for event in events]
    actual = deduplicate_events(events)
    if actual != expected or events != original:
        raise AssertionError(f"Expected {expected}, got {actual}")
print(f"Passed {len(tests)}/{len(tests)} tests")
EOF
          ;;
        security-audit-log)
          cat <<'EOF'
tests = [
    ([{"actor": "service", "action": "read"}, {"actor": "guest", "action": "delete"}], ["service"], [1]),
    ([], ["admin"], []),
    ([{"actor": "admin", "action": "write"}, {"actor": "Admin", "action": "read"}, {"actor": "guest", "action": "delete"}], ["admin"], [1, 2]),
    ([{"actor": "guest", "action": "read"}], [], [0]),
]
for events, allowed_actors, expected in tests:
    actual = unauthorized_indexes(events, allowed_actors)
    if actual != expected:
        raise AssertionError(f"Expected {expected}, got {actual}")
print(f"Passed {len(tests)}/{len(tests)} tests")
EOF
          ;;
        *)
          printf 'Unsupported executable problem: %s\n' "$problem" >&2
          exit 2
          ;;
      esac
    } | run_with_timeout python3 -
    ;;
  java)
    cat > /run/code/Solution.java
    cat > /run/code/Main.java <<'EOF'
public class Main {
  public static void main(String[] args) {
    int[][] arrays = {{2, 7, 11, 15}, {3, 2, 4}, {-3, 4, 3, 90}, {1, 5, 3, 7, 9}};
    int[] targets = {9, 6, 0, 12};
    int[][] expected = {{0, 1}, {1, 2}, {0, 2}, {1, 3}};
    Solution solution = new Solution();
    for (int i = 0; i < arrays.length; i++) {
      int[] actual = solution.twoSum(arrays[i], targets[i]);
      if (actual == null || actual.length != 2 || actual[0] != expected[i][0] || actual[1] != expected[i][1]) {
        throw new AssertionError("Test " + (i + 1) + " failed");
      }
    }
    System.out.println("Passed " + arrays.length + "/" + arrays.length + " tests");
  }
}
EOF
    javac -encoding UTF-8 -d /run/code /run/code/Solution.java /run/code/Main.java
    run_with_timeout java -cp /run/code Main
    ;;
  c)
    {
      cat
      cat <<'EOF'

#include <stdio.h>
#include <stdlib.h>
int main(void) {
  const int a[] = {2, 7, 11, 15};
  const int b[] = {3, 2, 4};
  const int c[] = {-3, 4, 3, 90};
  const int d[] = {1, 5, 3, 7, 9};
  const int *arrays[] = {a, b, c, d};
  const int lengths[] = {4, 3, 4, 5};
  const int targets[] = {9, 6, 0, 12};
  const int expected[][2] = {{0, 1}, {1, 2}, {0, 2}, {1, 3}};
  for (int i = 0; i < 4; i++) {
    int actual[2] = {-1, -1};
    two_sum(arrays[i], lengths[i], targets[i], actual);
    if (actual[0] != expected[i][0] || actual[1] != expected[i][1]) {
      fprintf(stderr, "Test %d failed\n", i + 1);
      return 1;
    }
  }
  printf("Passed 4/4 tests\n");
  return 0;
}
EOF
    } > /run/code/main.c
    gcc -std=c17 -O2 -Wall -Wextra -o /run/code/main /run/code/main.c
    run_with_timeout /run/code/main
    ;;
  cpp)
    {
      cat
      cat <<'EOF'

#include <iostream>
#include <vector>
int main() {
  const std::vector<std::vector<int>> arrays = {{2, 7, 11, 15}, {3, 2, 4}, {-3, 4, 3, 90}, {1, 5, 3, 7, 9}};
  const int targets[] = {9, 6, 0, 12};
  const std::vector<std::vector<int>> expected = {{0, 1}, {1, 2}, {0, 2}, {1, 3}};
  for (int i = 0; i < 4; i++) {
    if (twoSum(arrays[i], targets[i]) != expected[i]) {
      std::cerr << "Test " << i + 1 << " failed\n";
      return 1;
    }
  }
  std::cout << "Passed 4/4 tests\n";
}
EOF
    } > /run/code/main.cpp
    g++ -std=c++17 -O2 -Wall -Wextra -o /run/code/main /run/code/main.cpp
    run_with_timeout /run/code/main
    ;;
  *)
    printf 'Unsupported language\n' >&2
    exit 2
    ;;
esac
