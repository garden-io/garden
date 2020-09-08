#!/usr/bin/env ts-node

import execa from "execa"
import minimist from "minimist"
import minimatch from "minimatch"
import Bluebird from "bluebird"
import { max, padEnd, padStart, mapValues, pickBy } from "lodash"
import { DepGraph } from "dependency-graph"
import split2 = require("split2")
import chalk from "chalk"
import wrapAnsi from "wrap-ansi"
import stripAnsi from "strip-ansi"
import { resolve } from "path"

const colors = [
	chalk.red,
	chalk.green,
	chalk.yellow,
	chalk.magenta,
	chalk.cyan,
]

const lineChar = "┄"
const yarnPath = resolve(__dirname, "..", ".yarn", "releases", "yarn-1.22.5.js")

export async function getPackages({ scope, ignore }: { scope?: string; ignore?: string } = {}) {
  let packages = JSON.parse(
    (await execa("node", [yarnPath, "--silent", "workspaces", "info"])).stdout
  )

  if (scope) {
    packages = pickBy(packages, (_, k) => minimatch(k, scope))
  }

  if (ignore) {
    packages = pickBy(packages, (_, k) => !minimatch(k, ignore))
  }

  return mapValues(packages, (p, k) => {
    const location = resolve(__dirname, "..", p.location)
    return {
      ...p,
      name: k,
      location,
      packageJson: require(resolve(location, "package.json")),
      shortName: k.split("/")[1],
    }
  })
}

async function runInPackages(args: string[]) {
  const argv = minimist(args, { boolean: ["bail", "parallel"], default: { bail: true } })
  const script = argv._[0]
  const { scope, ignore, bail, parallel } = argv
  const repoRoot = resolve(__dirname, "..")

  if (!script) {
    throw new Error("Must specify script name")
  }

  const packages = await getPackages({ scope, ignore })
  const packageList: any[] = Object.values(packages)

  for (let i = 0; i < packageList.length; i++) {
    packageList[i].color = colors[i % colors.length]
  }

  console.log(
    chalk.cyanBright(
      `\nRunning script ${chalk.whiteBright(script)} in package(s) ` +
      chalk.whiteBright(Object.keys(packages).join(", "))
    )
  )

  // Make sure subprocesses inherit color support level
  process.env.FORCE_COLOR = chalk.supportsColor.level.toString()

  const maxNameLength = max(packageList.map((p) => p.shortName.length)) as number
  let lastPackage: string = ""
  let failed: string[] = []

  async function runScript(packageName: string) {
    const { color, location, shortName, packageJson } = packages[packageName]

    if (!packageJson.scripts || !packageJson.scripts[script]) {
      return
    }

    const proc = execa(yarnPath, ["run", script], { cwd: resolve(repoRoot, location), reject: false })

    const stream = split2()
    stream.on("data", (data) => {
      const width = process.stdout.columns
      const line = data.toString()

      if (line.trim().length <= 0) {
        return
      }

      if (lastPackage !== packageName) {
        console.log(chalk.gray(padEnd("", width || 80, "┄")))
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

        console.log(`${color.bold(prefix)}${justified[0]}${color.bold(suffix)}`)

        for (const nextLine of justified.slice(1)) {
          console.log(`${padStart(nextLine, prefix.length + lineWidth, " ")}${color.bold(suffix)}`)
        }
      } else {
        console.log(color.bold(prefix) + line)
      }
    })

    proc.stdout?.pipe(stream)
    proc.stderr?.pipe(stream)

    const result = await proc

    if (result.exitCode !== 0) {
      if (bail) {
        console.log(
          chalk.redBright(`\n${script} script in package ${packageName} failed with code ${result.exitCode}`)
        )
        process.exit(result.exitCode)
      } else {
        failed.push(packageName)
      }
    }
  }

  if (parallel) {
    await Bluebird.map(Object.keys(packages), runScript)
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
      await Bluebird.map(leaves, runScript)
      for (const name of leaves) {
        depGraph.removeNode(name)
      }
      leaves = depGraph.overallOrder(true)
    }
  }

  console.log(chalk.gray(padEnd("", process.stdout.columns || 80, "┄")))

  if (failed.length > 0) {
    console.log(chalk.redBright(`${script} script failed in ${failed.length} packages(s): ${failed.join(", ")}\n`))
    process.exit(failed.length)
  } else {
    console.log(chalk.greenBright("Done!\n"))
  }
}

runInPackages(process.argv.slice(2))
  .catch((err) => {
    console.log(chalk.redBright(err))
    process.exit(1)
  })
