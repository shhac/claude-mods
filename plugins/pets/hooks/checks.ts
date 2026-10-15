// Whether a shell command Claude ran is a test run, so the pet can cheer a
// green one and wince at a red one.

// How a segment of a command starts when it runs tests. Only the start
// counts: `ls tests` or `git commit -m "add test"` aren't test runs.
const RUNNERS: readonly RegExp[] = [
  /^((npx|bunx|pnpm exec|yarn) )?(vitest|jest|mocha|pytest|rspec|phpunit|tox)\b/,
  /^python3? -m (pytest|unittest)\b/,
  /^(go|cargo|bun|deno|dotnet|swift|mix) test\b/,
  /^(npm|pnpm|yarn|bun)( run)? test\b/,
  /^make (test|check)\b/,
  /^(gradle|\.\/gradlew|mvn) test\b/,
  /^claude plugin test\b/,
]

// Leading `NAME=value` settings don't change what runs.
const withoutSettings = (segment: string) => segment.replace(/^(\w+=\S*\s+)+/, '')

export function isTestRun(command: string) {
  return command
    .split(/&&|\|\||;|\|/)
    .map(segment => withoutSettings(segment.trim()))
    .some(segment => RUNNERS.some(runner => runner.test(segment)))
}
