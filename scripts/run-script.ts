#!/usr/bin/env -S node --import ./scripts/register-hook.js
/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
/* eslint-disable no-console */

import { execa } from "execa"
import { max, padEnd, padStart } from "lodash-es"
import { DepGraph } from "dependency-graph"
import split2 from "split2"
import chalk, { supportsColor } from "chalk"
import wrapAnsi from "wrap-ansi"
import stripAnsi from "strip-ansi"
import { dirname, join, resolve } from "node:path"
import type { WriteStream } from "node:fs"
import { createWriteStream } from "node:fs"
import { getPackages } from "./script-utils.js"
import yargs from "yargs/yargs"
import { fileURLToPath } from "node:url"

const moduleDirName = dirname(fileURLToPath(import.meta.url))

const colors = [chalk.blueBright, chalk.green, chalk.yellow, chalk.magenta, chalk.cyan]

const lineChar = "┄"

async function runInPackages(args: string[]) {
  const parsed = await yargs()
    .parserConfiguration({
      "unknown-options-as-args": true,
    })
    .option("bail", { type: "boolean", default: true })
    .option("parallel", { type: "boolean", default: false })
    .option("scope", { type: "string" })
    .option("ignore", { type: "string" })
    .option("report", { type: "string" })
    .parse(args)

  const script = parsed._[0] as string
  const rest = parsed._.slice(1) as string[]
  const { scope, ignore, bail, parallel } = parsed
  const repoRoot = resolve(moduleDirName, "..")

  if (!script) {
    throw new Error("Must specify script name")
  }

  let reportStream: WriteStream | undefined = undefined

  if (parsed.report) {
    const path = join(process.cwd(), parsed.report)
    console.log(chalk.cyan(`Writing script output to ${path}`))
    reportStream = createWriteStream(path)
  }

  const packageList = await getPackages({ scope, ignore })
  const packagesWithColor = packageList.map((pack, i) => {
    return {
      ...pack,
      color: colors[i % colors.length],
    }
  })
  const packageNames = packagesWithColor.map(({ name }) => name)

  write(
    chalk.cyanBright(
      `\nRunning script ${chalk.whiteBright(script)} in package(s) ` + chalk.whiteBright(packageNames.join(", "))
    )
  )

  // Make sure subprocesses inherit color support level
  process.env.FORCE_COLOR = supportsColor.toString() || "0"

  const maxNameLength = max(packagesWithColor.map((p) => p.shortName.length)) as number
  let lastPackage = ""
  const failed: string[] = []

  function write(line: string) {
    console.log(line)
    reportStream?.write(line + "\n")
  }

  async function runScript(packageName: string) {
    const pack = packagesWithColor.find((p) => p.name === packageName)
    if (!pack) {
      throw new Error(`Could not find package ${packageName}`)
    }
    const { color, shortName, packageJson } = pack

    if (!packageJson.scripts || !packageJson.scripts[script]) {
      return
    }

    const proc = execa(
      "npm",
      ["run", script, `--workspace=${pack.name}`, ...(rest.length > 0 ? ["--", ...rest] : [])],
      { cwd: repoRoot, reject: false }
    )

    void proc.on("error", (error) => {
      write(chalk.redBright(`\nCould not run ${script} script in package ${packageName}: ${error}`))
      process.exit(1)
    })

    const stream = split2()
    stream.on("data", (data) => {
      const width = process.stdout.columns
      const line = data.toString()

      if (line.trim().length <= 0) {
        return
      }

      if (lastPackage !== packageName) {
        write(chalk.gray(padEnd("", width || 80, "┄")))
      }
      lastPackage = packageName

      const prefix = padEnd(shortName + " ", maxNameLength + 1, lineChar) + "  "

      // Only wrap and suffix if the terminal doesn't have a set width or is reasonably wider than the prefix length
      if (process.stdout.columns > maxNameLength + 30) {
        const suffix = "  " + lineChar + lineChar
        const lineWidth = width - prefix.length - suffix.length

        const justified = wrapAnsi(line, lineWidth, { trim: false })
          .split("\n")
          .map((l) => l + padEnd("", lineWidth - stripAnsi(l).length, " "))

        write(`${color.bold(prefix)}${justified[0]}${color.bold(suffix)}`)

        for (const nextLine of justified.slice(1)) {
          write(`${padStart(nextLine, prefix.length + lineWidth, " ")}${color.bold(suffix)}`)
        }
      } else {
        write(color.bold(prefix) + line)
      }
    })

    proc.stdout?.pipe(stream)
    proc.stderr?.pipe(stream)

    const result = await proc

    if (result.exitCode && result.exitCode !== 0) {
      if (bail) {
        write(chalk.redBright(`\n${script} script in package ${packageName} failed with code ${result.exitCode}`))
        process.exit(result.exitCode)
      } else {
        failed.push(packageName)
      }
    }
  }

  if (parallel) {
    const targetPackageNames = packageList.map(({ name }) => name)
    await Promise.all(targetPackageNames.map(runScript))
  } else {
    const depGraph = new DepGraph()
    for (const p of packagesWithColor) {
      depGraph.addNode(p.name)
      const deps = p.workspaceDependencies
      for (const dep of deps) {
        depGraph.addNode(dep)
        depGraph.addDependency(p.name, dep)
      }
    }

    let leaves = depGraph.overallOrder(true)

    while (leaves.length > 0) {
      await Promise.all(leaves.map(runScript))
      for (const name of leaves) {
        depGraph.removeNode(name)
      }
      leaves = depGraph.overallOrder(true)
    }
  }

  write(chalk.gray(padEnd("", process.stdout.columns || 80, "┄")))

  if (failed.length > 0) {
    write(chalk.redBright(`${script} script failed in ${failed.length} packages(s): ${failed.join(", ")}\n`))
    process.exit(failed.length)
  } else {
    write(chalk.greenBright("Done!\n"))
  }
}

runInPackages(process.argv.slice(2)).catch((err) => {
  console.log(chalk.redBright(err))
  process.exit(1)
})
