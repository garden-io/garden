/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import execa from "execa"
import minimist from "minimist"
import { resolve } from "path"
import { examplesDir } from "./helpers"
import dedent from "dedent"
import chalk from "chalk"
import { join } from "path"

export const parsedArgs = minimist(process.argv.slice(2))

const usageStr = dedent`
Runs the e2e tests. The following options are supported:

${chalk.green("-h")}: Prints this message and quits.

${chalk.green("--binPath")}: Uses the garden binary at the path provided instead \
of the one at ${chalk.blue("[garden-root]/bin/garden")}.

${chalk.green("--env")}: The environment to run the test in. \
E.g. ${chalk.blue("local")} or ${chalk.blue("testing")}.

${chalk.green("--project")}: Specify the project to run (required). \
E.g. ${chalk.blue("demo-project")} or ${chalk.blue("vote-helm")}.

Example: ./core/bin/e2e-project.ts --binPath=/path/to/garden --project=demo-project --showlog=true
`

async function run() {
  // tslint:disable: no-console
  const project = parsedArgs.project

  if (!project) {
    throw new Error(`Must specify project name with --project parameter`)
  }

  // Abort if examples dir is dirty to prevent changes being checked out
  const projectDir = resolve(examplesDir, project)
  try {
    await execa("git", ["diff-index", "--quiet", "HEAD", projectDir])
  } catch (_error) {
    throw new Error(`${project} example directory is dirty. Aborting.`)
  }

  if (parsedArgs["h"]) {
    console.log(usageStr)
    return
  }

  console.log(chalk.grey("Call this script with -h for usage information.\n"))

  console.log(
    chalk.cyan.bold("*** Starting e2e tests for project ") + chalk.white.bold(project) + chalk.cyan.bold(" ***")
  )

  const mochaOpts = ["--config", join(__dirname, ".mocharc.yml")]

  for (const [key, value] of Object.entries(parsedArgs)) {
    if (key !== "_" && key !== "--") {
      mochaOpts.push("--" + key, value)
    }
  }

  const mochaBinPath = resolve(__dirname, "node_modules/.bin/mocha")
  await execa(mochaBinPath, mochaOpts, {
    cwd: __dirname,
    stdio: "inherit",
  })

  console.log(chalk.green.bold("\nDone!"))
}

run()
  .then(() => {
    process.exit(0)
  })
  .catch((err) => {
    console.log(err)
    process.exit(1)
  })
