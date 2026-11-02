#!/bin/sh
set -eu

language="${1:-}"
problem="${2:-}"

if [ "$problem" != "two-sum" ]; then
  printf 'Unsupported problem\n' >&2
  exit 2
fi

run_with_timeout() {
  exec timeout 5s "$@"
}

case "$language" in
  javascript)
    {
      cat
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
    } | run_with_timeout node --input-type=commonjs -
    ;;
  python)
    {
      cat
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
