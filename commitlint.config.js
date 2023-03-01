module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // Extend to add improvement key
    "type-enum": [
      2,
      "always",
      ["chore", "ci", "docs", "feat", "fix", "improvement", "perf", "refactor", "revert", "style", "test"],
    ],
    "header-max-length": [2, "always", 120],
  },
}
