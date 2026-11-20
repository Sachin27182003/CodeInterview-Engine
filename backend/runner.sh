#!/bin/sh
set -eu

language="${1:-}"
problem="${2:-}"

case "$problem:$language" in
  two-sum:*|role-easy-*:javascript|role-easy-*:python|frontend-state-updates:javascript|frontend-state-updates:python|frontend-render-window:javascript|frontend-render-window:python|backend-concurrency-window:javascript|backend-concurrency-window:python|backend-rate-limiter:javascript|backend-rate-limiter:python|indexed-log-search:javascript|indexed-log-search:python|retry-budget:javascript|retry-budget:python|data-deduplicate-events:javascript|data-deduplicate-events:python|find-maximum-number:javascript|find-maximum-number:python|count-vowels:javascript|count-vowels:python|valid-parentheses:javascript|valid-parentheses:python|merge-overlapping-intervals:javascript|merge-overlapping-intervals:python|longest-increasing-subsequence:javascript|longest-increasing-subsequence:python|minimum-window-substring:javascript|minimum-window-substring:python|security-audit-log:javascript|security-audit-log:python)
    ;;
  *)
    printf 'Unsupported problem/language combination: %s/%s\n' "$problem" "$language" >&2
    exit 2
    ;;
esac

run_with_timeout() {
  exec timeout 5s "$@"
}

runner_entry_point="${3:-}"
runner_test_cases="${4:-}"
case "$problem" in
  role-easy-*)
    if [ -z "$runner_entry_point" ] || [ -z "$runner_test_cases" ]; then
      printf 'Missing grading data for beginner role question: %s\n' "$problem" >&2
      exit 2
    fi
    case "$language" in
      javascript)
        {
          cat
          cat <<'EOF'

const { isDeepStrictEqual } = require("node:util");
const __entryPoint = process.env.RUNNER_ENTRY_POINT;
if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(__entryPoint)) throw new Error("Invalid question entry point");
const __run = eval(__entryPoint);
const __cases = JSON.parse(Buffer.from(process.env.RUNNER_TEST_CASES, "base64").toString("utf8"));
for (const { args, expected } of __cases) {
  const actual = __run(...args);
  if (!isDeepStrictEqual(actual, expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
console.log(`Passed ${__cases.length}/${__cases.length} tests`);
EOF
        } | RUNNER_ENTRY_POINT="$runner_entry_point" RUNNER_TEST_CASES="$runner_test_cases" run_with_timeout node --input-type=commonjs -
        ;;
      python)
        {
          cat
          cat <<'EOF'

import base64
import json
import os

_entry_point = os.environ["RUNNER_ENTRY_POINT"]
if not _entry_point.isidentifier():
    raise ValueError("Invalid question entry point")
_cases = json.loads(base64.b64decode(os.environ["RUNNER_TEST_CASES"]).decode("utf-8"))
_function = globals()[_entry_point]
for _case in _cases:
    _actual = _function(*_case["args"])
    if _actual != _case["expected"]:
        raise AssertionError(f"Expected {_case['expected']!r}, got {_actual!r}")
print(f"Passed {len(_cases)}/{len(_cases)} tests")
EOF
        } | RUNNER_ENTRY_POINT="$runner_entry_point" RUNNER_TEST_CASES="$runner_test_cases" run_with_timeout python3 -
        ;;
      *)
        printf 'Beginner role questions support JavaScript and Python only\n' >&2
        exit 2
        ;;
    esac
    exit $?
    ;;
esac

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
        find-maximum-number)
          cat <<'EOF'

const tests = [
  [[3, 1, 8, 2], 8],
  [[-5, -2, -9], -2],
  [[4, 4, 4], 4],
];
for (const [numbers, expected] of tests) {
  const actual = findMaximum(numbers);
  if (actual !== expected) throw new Error(`Expected ${expected}, got ${actual}`);
}
console.log(`Passed ${tests.length}/${tests.length} tests`);
EOF
          ;;
        count-vowels)
          cat <<'EOF'

const tests = [["Interview", 4], ["rhythm", 0], ["AEIOU", 5]];
for (const [text, expected] of tests) {
  const actual = countVowels(text);
  if (actual !== expected) throw new Error(`Expected ${expected}, got ${actual}`);
}
console.log(`Passed ${tests.length}/${tests.length} tests`);
EOF
          ;;
        valid-parentheses)
          cat <<'EOF'

const tests = [["()[]{}", true], ["([{}])", true], ["(]", false], ["([)]", false], ["(()", false]];
for (const [text, expected] of tests) {
  const actual = isValidBrackets(text);
  if (actual !== expected) throw new Error(`Expected ${expected}, got ${actual}`);
}
console.log(`Passed ${tests.length}/${tests.length} tests`);
EOF
          ;;
        merge-overlapping-intervals)
          cat <<'EOF'

const tests = [
  [[[1, 3], [2, 6], [8, 10], [15, 18]], [[1, 6], [8, 10], [15, 18]]],
  [[[1, 4], [4, 5]], [[1, 5]]],
  [[], []],
  [[[5, 7], [1, 2]], [[1, 2], [5, 7]]],
];
for (const [intervals, expected] of tests) {
  const original = JSON.stringify(intervals);
  const actual = mergeIntervals(intervals);
  if (JSON.stringify(actual) !== JSON.stringify(expected) || JSON.stringify(intervals) !== original) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
console.log(`Passed ${tests.length}/${tests.length} tests`);
EOF
          ;;
        longest-increasing-subsequence)
          cat <<'EOF'

const tests = [[[10, 9, 2, 5, 3, 7, 101, 18], 4], [[0, 1, 0, 3, 2, 3], 4], [[7, 7, 7, 7], 1], [[], 0]];
for (const [numbers, expected] of tests) {
  const actual = longestIncreasingSubsequence(numbers);
  if (actual !== expected) throw new Error(`Expected ${expected}, got ${actual}`);
}
console.log(`Passed ${tests.length}/${tests.length} tests`);
EOF
          ;;
        minimum-window-substring)
          cat <<'EOF'

const tests = [["ADOBECODEBANC", "ABC", "BANC"], ["a", "a", "a"], ["a", "aa", ""], ["aa", "aa", "aa"]];
for (const [source, target, expected] of tests) {
  const actual = minimumWindow(source, target);
  if (actual !== expected) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
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
        find-maximum-number)
          cat <<'EOF'

tests = [([3, 1, 8, 2], 8), ([-5, -2, -9], -2), ([4, 4, 4], 4)]
for numbers, expected in tests:
    actual = find_maximum(numbers)
    if actual != expected:
        raise AssertionError(f"Expected {expected}, got {actual}")
print(f"Passed {len(tests)}/{len(tests)} tests")
EOF
          ;;
        count-vowels)
          cat <<'EOF'

tests = [("Interview", 4), ("rhythm", 0), ("AEIOU", 5)]
for text, expected in tests:
    actual = count_vowels(text)
    if actual != expected:
        raise AssertionError(f"Expected {expected}, got {actual}")
print(f"Passed {len(tests)}/{len(tests)} tests")
EOF
          ;;
        valid-parentheses)
          cat <<'EOF'

tests = [("()[]{}", True), ("([{}])", True), ("(]", False), ("([)]", False), ("(()", False)]
for text, expected in tests:
    actual = is_valid_brackets(text)
    if actual != expected:
        raise AssertionError(f"Expected {expected}, got {actual}")
print(f"Passed {len(tests)}/{len(tests)} tests")
EOF
          ;;
        merge-overlapping-intervals)
          cat <<'EOF'

tests = [
    ([[1, 3], [2, 6], [8, 10], [15, 18]], [[1, 6], [8, 10], [15, 18]]),
    ([[1, 4], [4, 5]], [[1, 5]]),
    ([], []),
    ([[5, 7], [1, 2]], [[1, 2], [5, 7]]),
]
for intervals, expected in tests:
    original = [interval[:] for interval in intervals]
    actual = merge_intervals(intervals)
    if actual != expected or intervals != original:
        raise AssertionError(f"Expected {expected}, got {actual}")
print(f"Passed {len(tests)}/{len(tests)} tests")
EOF
          ;;
        longest-increasing-subsequence)
          cat <<'EOF'

tests = [([10, 9, 2, 5, 3, 7, 101, 18], 4), ([0, 1, 0, 3, 2, 3], 4), ([7, 7, 7, 7], 1), ([], 0)]
for numbers, expected in tests:
    actual = longest_increasing_subsequence(numbers)
    if actual != expected:
        raise AssertionError(f"Expected {expected}, got {actual}")
print(f"Passed {len(tests)}/{len(tests)} tests")
EOF
          ;;
        minimum-window-substring)
          cat <<'EOF'

tests = [("ADOBECODEBANC", "ABC", "BANC"), ("a", "a", "a"), ("a", "aa", ""), ("aa", "aa", "aa")]
for source, target, expected in tests:
    actual = minimum_window(source, target)
    if actual != expected:
        raise AssertionError(f"Expected {expected!r}, got {actual!r}")
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
