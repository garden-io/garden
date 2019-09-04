import execa from "execa"
import parseArgs = require("minimist")
import { resolve } from "path"
import { examplesDir } from "../helpers"
import { dedent } from "../../src/util/string"
import chalk from "chalk"
import { InternalError } from "../../src/exceptions"
import { GARDEN_SERVICE_ROOT } from "../../src/constants"

export const parsedArgs = parseArgs(process.argv.slice(2))

const usageStr = dedent`
Runs the e2e tests. The following options are supported:

${chalk.green("-h")}: Prints this message and quits.

${chalk.green("--binPath")}: Uses the garden binary at the path provided instead \
of the one at ${chalk.blue("[garden-root]/bin/garden")}.

${chalk.green("--env")}: The environment to run the test in. \
E.g. ${chalk.blue("local")} or ${chalk.blue("testing")}.

${chalk.green("--project")}: Specify the project to run (required). \
E.g. ${chalk.blue("demo-project")} or ${chalk.blue("vote-helm")}.

Example: ./garden-service/bin/e2e-full.ts --binPath=/path/to/garden --project=demo-project
`

async function run() {
  const project = parsedArgs.project

  if (!project) {
    throw new Error(`Must specify project name with --project parameter`)
  }

  // Abort if examples dir is dirty to prevent changes being checked out
  const projectDir = resolve(examplesDir, project)
  try {
    await execa("git", ["diff-index", "--quiet", "HEAD", projectDir])
  } catch (_error) {
    throw new InternalError(`${project} example directory is dirty. Aborting.`, {})
  }

  if (parsedArgs["h"]) {
    console.log(usageStr)
    return
  }

  console.log(chalk.grey("Call this script with -h for usage information."))
  console.log("Starting e2e tests.")

  console.log("Running tests...")

  const mochaOpts = ["--opts", "test/mocha.e2e.opts"]

  for (const opt of ["binPath", "project", "env", "showlog"]) {
    if (parsedArgs[opt]) {
      mochaOpts.push(`--${opt}`, parsedArgs[opt])
    }
  }

  const mochaBinPath = resolve(GARDEN_SERVICE_ROOT, "node_modules/.bin/mocha")
  await execa(mochaBinPath, mochaOpts, {
    cwd: GARDEN_SERVICE_ROOT,
    stdio: "inherit",
  })
  console.log("Done.")
}

const start = async () => {
  try {
    await run()
    process.exit(0)
  } catch (err) {
    console.log(err)
    process.exit(1)
  }
}

start().catch(() => {})
