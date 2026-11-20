type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type EasyRoleTestCase = { args: JsonValue[]; expected: JsonValue };
export type EasyRoleProblem = {
  slug: string;
  difficulty: "easy";
  roles: string[];
  title: string;
  description: string;
  testCases: JsonValue[];
  boilerplateCode: { javascript: string; python: string };
  runnerEntryPoint: string;
  exampleInputNames: string[];
  runnerTestCases: EasyRoleTestCase[];
};

type Seed = {
  slug: string;
  roles: string[];
  title: string;
  description: string;
  jsName: string;
  pyName: string;
  jsParams: string;
  pyParams: string;
  tests: EasyRoleTestCase[];
};

function easyProblem(seed: Seed): EasyRoleProblem {
  const entryPoint = seed.jsName;
  return {
    slug: `role-easy-${seed.slug}`,
    difficulty: "easy",
    roles: seed.roles,
    title: seed.title,
    description: `${seed.description} Use a clear, beginner-friendly approach.`,
    testCases: seed.tests.map(({ args, expected }) => ({ args, expected })),
    boilerplateCode: {
      javascript: `function ${seed.jsName}(${seed.jsParams}) {\n  // ${seed.description}\n}`,
      python: `def ${seed.pyName}(${seed.pyParams}):\n    # ${seed.description}\n    pass`,
    },
    runnerEntryPoint: entryPoint,
    exampleInputNames: seed.jsParams.split(",").map((name) => name.trim()),
    runnerTestCases: seed.tests,
  };
}

const frontendRoles = ["Frontend Developer", "Web Developer", "Full-Stack Developer"];
const backendRoles = ["Backend Developer", "Full-Stack Developer", "Software Engineer"];
const fullStackRoles = ["Full-Stack Developer", "Web Developer", "Software Engineer", "General Software Engineering"];
const dataRoles = ["Data Scientist", "Machine Learning/AI Engineer", "Software Engineer"];
const platformRoles = ["DevOps/SRE", "Cloud Architect", "Backend Developer"];
const securityRoles = ["Security Engineer", "Backend Developer", "QA/SDET"];
const qualityRoles = ["QA/SDET", "Software Engineer", "General Software Engineering"];
const mobileRoles = ["Mobile App Developer", "Frontend Developer", "Full-Stack Developer"];
const generalRoles = ["Software Engineer", "General Software Engineering", "Web Developer", "Backend Developer", "Full-Stack Developer", "Machine Learning/AI Engineer", "Data Scientist", "DevOps/SRE", "Mobile App Developer", "Cloud Architect", "Security Engineer", "QA/SDET"];

const seeds: Seed[] = [
  // Frontend and web development
  { slug: "greeting-name", roles: frontendRoles, title: "Create a greeting", description: "Return a greeting that includes the supplied name.", jsName: "createGreeting", pyName: "create_greeting", jsParams: "name", pyParams: "name", tests: [{ args: ["Ari"], expected: "Hello, Ari!" }, { args: ["Sam"], expected: "Hello, Sam!" }] },
  { slug: "capitalize-first-letter", roles: frontendRoles, title: "Capitalize a label", description: "Return the text with its first character capitalized and leave the remaining characters unchanged. Return an empty string for empty input.", jsName: "capitalizeFirst", pyName: "capitalize_first", jsParams: "text", pyParams: "text", tests: [{ args: ["dashboard"], expected: "Dashboard" }, { args: ["aPI"], expected: "API" }, { args: [""], expected: "" }] },
  { slug: "format-price", roles: frontendRoles, title: "Format a price", description: "Return the supplied non-negative number with a dollar sign and exactly two decimal places.", jsName: "formatPrice", pyName: "format_price", jsParams: "amount", pyParams: "amount", tests: [{ args: [12], expected: "$12.00" }, { args: [4.5], expected: "$4.50" }, { args: [0], expected: "$0.00" }] },
  { slug: "count-visible-items", roles: frontendRoles, title: "Count visible items", description: "Given a list of items with a visible boolean property, return how many items are visible.", jsName: "countVisibleItems", pyName: "count_visible_items", jsParams: "items", pyParams: "items", tests: [{ args: [[{ visible: true }, { visible: false }, { visible: true }]], expected: 2 }, { args: [[]], expected: 0 }, { args: [[{ visible: false }]], expected: 0 }] },
  { slug: "toggle-theme", roles: frontendRoles, title: "Toggle a theme", description: "Return dark when the current theme is light, and light when it is dark.", jsName: "toggleTheme", pyName: "toggle_theme", jsParams: "theme", pyParams: "theme", tests: [{ args: ["light"], expected: "dark" }, { args: ["dark"], expected: "light" }] },

  // Backend and API fundamentals
  { slug: "sum-list", roles: backendRoles, title: "Sum a list of values", description: "Return the sum of all numbers in the list. Return zero for an empty list.", jsName: "sumValues", pyName: "sum_values", jsParams: "values", pyParams: "values", tests: [{ args: [[2, 3, 5]], expected: 10 }, { args: [[]], expected: 0 }, { args: [[-2, 7]], expected: 5 }] },
  { slug: "count-even-numbers", roles: backendRoles, title: "Count even numbers", description: "Return the number of even integers in the list.", jsName: "countEven", pyName: "count_even", jsParams: "numbers", pyParams: "numbers", tests: [{ args: [[1, 2, 4, 7]], expected: 2 }, { args: [[]], expected: 0 }, { args: [[-2, -1, 0]], expected: 2 }] },
  { slug: "find-record-by-id", roles: backendRoles, title: "Find a record by ID", description: "Return the first record whose id equals the requested id, or null if no record matches.", jsName: "findRecord", pyName: "find_record", jsParams: "records, id", pyParams: "records, record_id", tests: [{ args: [[{ id: 1, name: "A" }, { id: 2, name: "B" }], 2], expected: { id: 2, name: "B" } }, { args: [[{ id: 1 }], 9], expected: null }, { args: [[], 1], expected: null }] },
  { slug: "filter-active-users", roles: backendRoles, title: "Filter active users", description: "Return a new list containing only users whose active property is true, preserving their original order.", jsName: "activeUsers", pyName: "active_users", jsParams: "users", pyParams: "users", tests: [{ args: [[{ name: "A", active: true }, { name: "B", active: false }]], expected: [{ name: "A", active: true }] }, { args: [[]], expected: [] }, { args: [[{ name: "C", active: true }]], expected: [{ name: "C", active: true }] }] },
  { slug: "default-page-size", roles: backendRoles, title: "Apply a default page size", description: "Return the requested page size when it is a positive number; otherwise return the default size of 20.", jsName: "pageSizeOrDefault", pyName: "page_size_or_default", jsParams: "pageSize", pyParams: "page_size", tests: [{ args: [10], expected: 10 }, { args: [0], expected: 20 }, { args: [-3], expected: 20 }] },

  // Full-stack product data
  { slug: "full-name", roles: fullStackRoles, title: "Build a full name", description: "Join a first and last name with one space, trimming extra whitespace at the start or end of either name.", jsName: "fullName", pyName: "full_name", jsParams: "first, last", pyParams: "first, last", tests: [{ args: ["Ada", "Lovelace"], expected: "Ada Lovelace" }, { args: ["  Lin", " Chen  "], expected: "Lin Chen" }] },
  { slug: "count-completed-tasks", roles: fullStackRoles, title: "Count completed tasks", description: "Return how many tasks in the list have completed set to true.", jsName: "countCompleted", pyName: "count_completed", jsParams: "tasks", pyParams: "tasks", tests: [{ args: [[{ completed: true }, { completed: false }, { completed: true }]], expected: 2 }, { args: [[]], expected: 0 }] },
  { slug: "cart-total", roles: fullStackRoles, title: "Calculate a cart total", description: "Given cart items with price and quantity, return the total cost across all items.", jsName: "cartTotal", pyName: "cart_total", jsParams: "items", pyParams: "items", tests: [{ args: [[{ price: 3, quantity: 2 }, { price: 5, quantity: 1 }]], expected: 11 }, { args: [[]], expected: 0 }] },
  { slug: "first-matching-product", roles: fullStackRoles, title: "Find a product by name", description: "Return the first product whose name exactly matches the requested name, or null if there is no match.", jsName: "findProduct", pyName: "find_product", jsParams: "products, name", pyParams: "products, name", tests: [{ args: [[{ name: "Mug", price: 8 }, { name: "Book", price: 12 }], "Book"], expected: { name: "Book", price: 12 } }, { args: [[], "Pen"], expected: null }] },
  { slug: "has-required-fields", roles: fullStackRoles, title: "Check required form fields", description: "Return true only when an object has non-empty string values for both name and email.", jsName: "hasRequiredFields", pyName: "has_required_fields", jsParams: "form", pyParams: "form", tests: [{ args: [{ name: "Jo", email: "jo@example.com" }], expected: true }, { args: [{ name: "Jo", email: "" }], expected: false }, { args: [{}], expected: false }] },

  // General software engineering basics
  { slug: "rectangle-area", roles: generalRoles, title: "Calculate rectangle area", description: "Return the area of a rectangle from its width and height.", jsName: "rectangleArea", pyName: "rectangle_area", jsParams: "width, height", pyParams: "width, height", tests: [{ args: [4, 3], expected: 12 }, { args: [0, 8], expected: 0 }] },
  { slug: "reverse-list", roles: generalRoles, title: "Reverse a list", description: "Return a new list containing the input values in reverse order without changing the original list.", jsName: "reverseList", pyName: "reverse_list", jsParams: "items", pyParams: "items", tests: [{ args: [[1, 2, 3]], expected: [3, 2, 1] }, { args: [[]], expected: [] }, { args: [["a"]], expected: ["a"] }] },
  { slug: "count-occurrences", roles: generalRoles, title: "Count matching values", description: "Return how many times the target value appears in the list.", jsName: "countOccurrences", pyName: "count_occurrences", jsParams: "items, target", pyParams: "items, target", tests: [{ args: [[1, 2, 1, 1], 1], expected: 3 }, { args: [[], 4], expected: 0 }] },
  { slug: "sum-positive-numbers", roles: generalRoles, title: "Sum positive numbers", description: "Return the sum of numbers greater than zero, ignoring zero and negative values.", jsName: "sumPositive", pyName: "sum_positive", jsParams: "numbers", pyParams: "numbers", tests: [{ args: [[-2, 0, 3, 5]], expected: 8 }, { args: [[-1, 0]], expected: 0 }] },
  { slug: "get-middle-item", roles: generalRoles, title: "Get the middle item", description: "Return the middle value of a non-empty list. For an even number of values, return the item at index length divided by two. Assume the list is non-empty.", jsName: "middleItem", pyName: "middle_item", jsParams: "items", pyParams: "items", tests: [{ args: [[3, 6, 9]], expected: 6 }, { args: [[2, 4, 6, 8]], expected: 6 }] },

  // Data science and machine learning
  { slug: "average-score", roles: dataRoles, title: "Calculate an average score", description: "Return the arithmetic mean of the numbers. Return zero when the list is empty.", jsName: "averageScore", pyName: "average_score", jsParams: "scores", pyParams: "scores", tests: [{ args: [[2, 4, 6]], expected: 4 }, { args: [[]], expected: 0 }] },
  { slug: "count-above-threshold", roles: dataRoles, title: "Count values above a threshold", description: "Return how many values are strictly greater than the supplied threshold.", jsName: "countAbove", pyName: "count_above", jsParams: "values, threshold", pyParams: "values, threshold", tests: [{ args: [[2, 5, 8, 5], 5], expected: 1 }, { args: [[], 0], expected: 0 }] },
  { slug: "minimum-value", roles: dataRoles, title: "Find the smallest value", description: "Return the smallest number in a non-empty list. Do not use a built-in min function.", jsName: "smallestValue", pyName: "smallest_value", jsParams: "numbers", pyParams: "numbers", tests: [{ args: [[4, -2, 7]], expected: -2 }, { args: [[9]], expected: 9 }] },
  { slug: "normalize-binary-label", roles: dataRoles, title: "Normalize a binary label", description: "Return 1 when the value is exactly 1, and return 0 for every other value.", jsName: "normalizeLabel", pyName: "normalize_label", jsParams: "value", pyParams: "value", tests: [{ args: [1], expected: 1 }, { args: [0], expected: 0 }, { args: [2], expected: 0 }] },
  { slug: "group-values-by-label", roles: dataRoles, title: "Group values by label", description: "Given records with label and value fields, return an object mapping each label to the sum of its values.", jsName: "sumByLabel", pyName: "sum_by_label", jsParams: "records", pyParams: "records", tests: [{ args: [[{ label: "a", value: 2 }, { label: "b", value: 3 }, { label: "a", value: 4 }]], expected: { a: 6, b: 3 } }, { args: [[]], expected: {} }] },

  // DevOps, SRE, and cloud operations
  { slug: "healthy-service-count", roles: platformRoles, title: "Count healthy services", description: "Count services whose status is exactly healthy.", jsName: "healthyServiceCount", pyName: "healthy_service_count", jsParams: "services", pyParams: "services", tests: [{ args: [[{ status: "healthy" }, { status: "down" }, { status: "healthy" }]], expected: 2 }, { args: [[]], expected: 0 }] },
  { slug: "total-disk-usage", roles: platformRoles, title: "Total disk usage", description: "Given disk records with a used field, return the sum of all used values.", jsName: "totalDiskUsage", pyName: "total_disk_usage", jsParams: "disks", pyParams: "disks", tests: [{ args: [[{ used: 10 }, { used: 15 }]], expected: 25 }, { args: [[]], expected: 0 }] },
  { slug: "failed-job-count", roles: platformRoles, title: "Count failed jobs", description: "Return how many jobs have status equal to failed.", jsName: "failedJobCount", pyName: "failed_job_count", jsParams: "jobs", pyParams: "jobs", tests: [{ args: [[{ status: "failed" }, { status: "ok" }, { status: "failed" }]], expected: 2 }, { args: [[]], expected: 0 }] },
  { slug: "service-name-list", roles: platformRoles, title: "List service names", description: "Return a list containing the name of each service in the same order as the input.", jsName: "serviceNames", pyName: "service_names", jsParams: "services", pyParams: "services", tests: [{ args: [[{ name: "api" }, { name: "worker" }]], expected: ["api", "worker"] }, { args: [[]], expected: [] }] },
  { slug: "is-valid-port", roles: platformRoles, title: "Validate a port number", description: "Return true when the integer port is between 1 and 65535 inclusive; otherwise return false.", jsName: "isValidPort", pyName: "is_valid_port", jsParams: "port", pyParams: "port", tests: [{ args: [80], expected: true }, { args: [1], expected: true }, { args: [65536], expected: false }, { args: [0], expected: false }] },

  // Security fundamentals
  { slug: "mask-email-address", roles: securityRoles, title: "Mask an email address", description: "Return the email with every character before the @ replaced by asterisks, keeping the @ and domain unchanged.", jsName: "maskEmail", pyName: "mask_email", jsParams: "email", pyParams: "email", tests: [{ args: ["sam@example.com"], expected: "***@example.com" }, { args: ["a@site.test"], expected: "*@site.test" }] },
  { slug: "has-admin-role", roles: securityRoles, title: "Check for an admin role", description: "Return true when the roles list contains the exact string admin; otherwise return false.", jsName: "hasAdminRole", pyName: "has_admin_role", jsParams: "roles", pyParams: "roles", tests: [{ args: [["user", "admin"]], expected: true }, { args: [["Admin"]], expected: false }, { args: [[]], expected: false }] },
  { slug: "count-failed-logins", roles: securityRoles, title: "Count failed login attempts", description: "Count events whose result is exactly failed.", jsName: "failedLoginCount", pyName: "failed_login_count", jsParams: "events", pyParams: "events", tests: [{ args: [[{ result: "failed" }, { result: "success" }, { result: "failed" }]], expected: 2 }, { args: [[]], expected: 0 }] },
  { slug: "is-allowed-ip", roles: securityRoles, title: "Check an IP allowlist", description: "Return true when the requested IP address appears in the allowlist; otherwise return false.", jsName: "isAllowedIp", pyName: "is_allowed_ip", jsParams: "allowlist, ip", pyParams: "allowlist, ip", tests: [{ args: [["10.0.0.1", "10.0.0.2"], "10.0.0.2"], expected: true }, { args: [["10.0.0.1"], "10.0.0.3"], expected: false }] },
  { slug: "safe-file-extension", roles: securityRoles, title: "Check a safe file extension", description: "Return true only when the filename ends in .txt or .csv, ignoring letter case.", jsName: "isSafeFile", pyName: "is_safe_file", jsParams: "filename", pyParams: "filename", tests: [{ args: ["report.txt"], expected: true }, { args: ["DATA.CSV"], expected: true }, { args: ["script.exe"], expected: false }] },

  // QA and software testing
  { slug: "passed-test-count", roles: qualityRoles, title: "Count passed tests", description: "Count test results whose status is exactly passed.", jsName: "passedTestCount", pyName: "passed_test_count", jsParams: "results", pyParams: "results", tests: [{ args: [[{ status: "passed" }, { status: "failed" }, { status: "passed" }]], expected: 2 }, { args: [[]], expected: 0 }] },
  { slug: "failed-test-names", roles: qualityRoles, title: "List failed test names", description: "Return the names of failed tests in their original order.", jsName: "failedTestNames", pyName: "failed_test_names", jsParams: "results", pyParams: "results", tests: [{ args: [[{ name: "login", status: "passed" }, { name: "search", status: "failed" }]], expected: ["search"] }, { args: [[]], expected: [] }] },
  { slug: "all-checks-passed", roles: qualityRoles, title: "Check whether all tests passed", description: "Return true when every result has status passed. An empty list is considered passed.", jsName: "allChecksPassed", pyName: "all_checks_passed", jsParams: "results", pyParams: "results", tests: [{ args: [[{ status: "passed" }, { status: "passed" }]], expected: true }, { args: [[{ status: "passed" }, { status: "failed" }]], expected: false }, { args: [[]], expected: true }] },
  { slug: "find-first-failed-test", roles: qualityRoles, title: "Find the first failed test", description: "Return the index of the first failed test, or -1 when every test passed.", jsName: "firstFailedTest", pyName: "first_failed_test", jsParams: "results", pyParams: "results", tests: [{ args: [[{ status: "passed" }, { status: "failed" }]], expected: 1 }, { args: [[{ status: "passed" }]], expected: -1 }, { args: [[]], expected: -1 }] },
  { slug: "retry-failed-tests", roles: qualityRoles, title: "Select tests to retry", description: "Return the names of failed tests that are marked retryable, preserving input order.", jsName: "retryableFailures", pyName: "retryable_failures", jsParams: "results", pyParams: "results", tests: [{ args: [[{ name: "a", status: "failed", retryable: true }, { name: "b", status: "failed", retryable: false }]], expected: ["a"] }, { args: [[]], expected: [] }] },

  // Mobile application features
  { slug: "format-badge-count", roles: mobileRoles, title: "Format a notification badge", description: "Return the count as text, except values greater than 99 should be shown as 99+.", jsName: "formatBadge", pyName: "format_badge", jsParams: "count", pyParams: "count", tests: [{ args: [7], expected: "7" }, { args: [99], expected: "99" }, { args: [120], expected: "99+" }] },
  { slug: "clamp-volume", roles: mobileRoles, title: "Clamp a volume setting", description: "Return the volume limited to the inclusive range from 0 to 100.", jsName: "clampVolume", pyName: "clamp_volume", jsParams: "volume", pyParams: "volume", tests: [{ args: [50], expected: 50 }, { args: [-4], expected: 0 }, { args: [130], expected: 100 }] },
  { slug: "valid-username", roles: mobileRoles, title: "Validate a username", description: "Return true when the username has between 3 and 15 characters inclusive.", jsName: "isValidUsername", pyName: "is_valid_username", jsParams: "username", pyParams: "username", tests: [{ args: ["sachi"], expected: true }, { args: ["ab"], expected: false }, { args: ["abcdefghijklmnop"], expected: false }] },
  { slug: "file-extension", roles: mobileRoles, title: "Get a file extension", description: "Return the lowercase file extension without the dot, or an empty string when there is no extension.", jsName: "fileExtension", pyName: "file_extension", jsParams: "filename", pyParams: "filename", tests: [{ args: ["photo.PNG"], expected: "png" }, { args: ["readme"], expected: "" }, { args: ["archive.tar.gz"], expected: "gz" }] },
  { slug: "notification-message", roles: mobileRoles, title: "Create a notification message", description: "Return New message when the count is one, and New messages otherwise.", jsName: "notificationMessage", pyName: "notification_message", jsParams: "count", pyParams: "count", tests: [{ args: [1], expected: "New message" }, { args: [0], expected: "New messages" }, { args: [3], expected: "New messages" }] },

  // Cross-role beginner exercises
  { slug: "first-list-item", roles: generalRoles, title: "Get the first item", description: "Return the first item in a list, or null when the list is empty.", jsName: "firstItem", pyName: "first_item", jsParams: "items", pyParams: "items", tests: [{ args: [["a", "b"]], expected: "a" }, { args: [[]], expected: null }] },
  { slug: "last-list-item", roles: generalRoles, title: "Get the last item", description: "Return the last item in a list, or null when the list is empty.", jsName: "lastItem", pyName: "last_item", jsParams: "items", pyParams: "items", tests: [{ args: [["a", "b"]], expected: "b" }, { args: [[]], expected: null }] },
  { slug: "is-positive", roles: generalRoles, title: "Check for a positive number", description: "Return true only when the number is greater than zero.", jsName: "isPositive", pyName: "is_positive", jsParams: "number", pyParams: "number", tests: [{ args: [3], expected: true }, { args: [0], expected: false }, { args: [-1], expected: false }] },
  { slug: "join-words", roles: generalRoles, title: "Join words into a sentence", description: "Join the words in a list with a single space between each word.", jsName: "joinWords", pyName: "join_words", jsParams: "words", pyParams: "words", tests: [{ args: [["learn", "to", "code"]], expected: "learn to code" }, { args: [[]], expected: "" }, { args: [["hello"]], expected: "hello" }] },
  { slug: "repeat-label", roles: generalRoles, title: "Repeat a label", description: "Return a list containing the label repeated the requested number of times. A count of zero returns an empty list.", jsName: "repeatLabel", pyName: "repeat_label", jsParams: "label, count", pyParams: "label, count", tests: [{ args: ["ok", 3], expected: ["ok", "ok", "ok"] }, { args: ["x", 0], expected: [] }] },

];

export const easyRoleProblems: EasyRoleProblem[] = seeds.map(easyProblem);
