#!/usr/bin/env ts-node

import chalk from "chalk"
import execa from "execa"
import { resolve } from "path"
import { runInPackages } from "./run-script"
import fastGlob from "fast-glob"
import Bluebird from "bluebird"
import remark from "remark"
import remarkValidateLinks from "remark-validate-links"
import markdownLinkCheck from "markdown-link-check"
import { readFile } from "fs-extra"
import { groupBy, sortBy } from "lodash"

function parseGitDiff(stdout: string) {
  return stdout.split("\n").map((l) => l.split("\t")[1])
}

const markdownCheckConfig = {
  retryOn429: true,
  timeout: "120s",
  ignorePatterns: [
    {
      pattern: "local.app.garden",
      reason: "Ignore example URL"
    },
    {
      pattern: "^http://my-service",
      reason: "Ignore example URL"
    },
    {
      pattern: "^[^\/]+\/[^\/].*$|^\/[^\/].*$",
      reason: "Ignore relative paths. Those are handled by another tool due to: https://github.com/tcort/markdown-link-check/issues/65"
    },
    {
      pattern: "^#",
      reason: "Ignore relative paths. Those are handled by another tool due to: https://github.com/tcort/markdown-link-check/issues/65"
    }
  ]
}

interface LinkError {
  path: string
  url?: string
  error: string
}

async function checkDocs(force = false) {
  await runInPackages(["generate-docs"])

  try {
    await execa("git", ["diff", "--quiet", "HEAD", "--", "docs/"])
  } catch {
    throw new Error("Generated docs are not up-to-date! run \"yarn generate-docs\" and commit the changes\n")
  }

  if (!force) {
    // Check if anything has changed, otherwise bail
    let modifiedFiles: string[] = []

    try {
      const res = await execa("sh", ["-c", 'git diff --name-status master docs README.md'])
      modifiedFiles.push(...parseGitDiff(res.stdout))
    } catch {
      // All good
    }

    try {
      const res = await execa("sh", ["-c", 'git diff --name-status master examples | grep "examples.*README.md$"'])
      modifiedFiles.push(...parseGitDiff(res.stdout))
      console.log("Modified docs to check:\n" + modifiedFiles.map((d) => "- " + d).join("\n"))
    } catch {
      // All good
    }

    if (modifiedFiles.length === 0) {
      console.log("No modified docs found. Exiting.")
      return
    }

    console.log("Found modified docs (compared to master):\n" + modifiedFiles.map((d) => "- " + d).join("\n") + "\n")
  }

  const repoRoot = resolve(__dirname, "..")
  const webDocs = await fastGlob("docs/**/*.md", { cwd: repoRoot })
  const exampleDocs = await fastGlob("examples/*/README.md", { cwd: repoRoot })
  const allDocs = ["README.md"] // , ...webDocs, ...exampleDocs

  const errors: LinkError[] = []

  const remarkValidator = remark().use(remarkValidateLinks, { root: repoRoot })

  await Bluebird.map(allDocs, async (path) => {
    const content = (await readFile(resolve(repoRoot, path))).toString()

    // Check relative links
    const file = await remarkValidator.process(content)

    for (const message of file.messages) {
      errors.push({ path, url: message.url, error: message.toString() })
    }

    // Check external links
    return new Promise<void>((resolve, reject) => {
      markdownLinkCheck(content, markdownCheckConfig, (err, results) => {
        if (err) {
          return reject(err)
        }

        for (const result of results) {
          if (result.dead) {
            errors.push({ path, url: result.link, error: result.err })
          }
        }

        resolve()
      })
    })
  }, { concurrency: 30 })

  const grouped = groupBy(errors, "path")
  const sorted = sortBy(Object.entries(grouped), 0)

  console.log(sorted)
}

checkDocs(process.argv.includes("--force")).catch((err) => {
  console.log(chalk.redBright(err))
  process.exit(1)
})
