#!/usr/bin/env ts-node
/* eslint-disable no-console */

import execa from "execa"
import minimist from "minimist"
import { max, padEnd, padStart } from "lodash"
import { DepGraph } from "dependency-graph"
import split2 = require("split2")
import chalk from "chalk"
import wrapAnsi from "wrap-ansi"
import stripAnsi from "strip-ansi"
import { join, resolve } from "path"
import { createWriteStream, WriteStream } from "fs"
import { getPackages, yarnPath } from "./script-utils"

const colors = [chalk.blueBright, chalk.green, chalk.yellow, chalk.magenta, chalk.cyan]

const lineChar = "┄"

async function runInPackages(args: string[]) {
  const argv = minimist(args, { boolean: ["bail", "parallel"], default: { bail: true } })
  const script = argv._[0]
  const rest = argv._.slice(1)
  const { scope, ignore, bail, parallel } = argv
  const repoRoot = resolve(__dirname, "..")

  if (!script) {
    throw new Error("Must specify script name")
  }

  let reportStream: WriteStream | undefined = undefined

  if (argv.report) {
    const path = join(process.cwd(), argv.report)
    console.log(chalk.cyan(`Writing script output to ${path}`))
    reportStream = createWriteStream(path)
  }

  const packages = await getPackages({ scope, ignore })
  const packageList: any[] = Object.values(packages)

  for (let i = 0; i < packageList.length; i++) {
    packageList[i].color = colors[i % colors.length]
  }

  write(
    chalk.cyanBright(
      `\nRunning script ${chalk.whiteBright(script)} in package(s) ` +
        chalk.whiteBright(Object.keys(packages).join(", "))
    )
  )

  // Make sure subprocesses inherit color support level
  process.env.FORCE_COLOR = chalk.supportsColor.toString() || "0"

  const maxNameLength = max(packageList.map((p) => p.shortName.length)) as number
  let lastPackage: string = ""
  let failed: string[] = []

  function write(line: string) {
    console.log(line)
    reportStream?.write(line + "\n")
  }

  async function runScript(packageName: string) {
    const { color, location, shortName, packageJson } = packages[packageName]

    if (!packageJson.scripts || !packageJson.scripts[script]) {
      return
    }

    const proc = execa("node", [yarnPath, "run", script, ...rest], { cwd: resolve(repoRoot, location), reject: false })

    proc.on("error", (error) => {
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
    await Promise.all(Object.keys(packages).map(runScript))
  } else {
    const depGraph = new DepGraph()
    for (const p of packageList) {
      depGraph.addNode(p.name)
      const deps = packages[p.name].workspaceDependencies
      for (const dep of deps) {
        if (packages[dep]) {
          depGraph.addNode(dep)
          depGraph.addDependency(p.name, dep)
        }
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
