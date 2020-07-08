/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import dedent from "dedent"
import { pathExists, writeFile, copyFile } from "fs-extra"
import inquirer from "inquirer"
import {
  Command,
  CommandResult,
  CommandParams,
  PrepareParams,
  PathParameter,
  BooleanParameter,
  StringOption,
  StringParameter,
} from "../base"
import { printHeader } from "../../logger/util"
import { isDirectory } from "../../util/fs"
import { loadConfigResources } from "../../config/base"
import { resolve, basename, relative, join } from "path"
import { GardenBaseError, ParameterError } from "../../exceptions"
import { renderProjectConfigReference } from "../../docs/config"
import { addConfig } from "./helpers"
import { wordWrap } from "../../util/string"
import { LoggerType } from "../../logger/logger"

const ignorefileName = ".gardenignore"
const defaultIgnorefile = dedent`
# Add paths here that you would like Garden to ignore when building modules and computing versions,
# using the same syntax as .gitignore files.
# For more info, see https://docs.garden.io/using-garden/configuration-overview#including-excluding-files-and-directories
`

export const defaultProjectConfigFilename = "project.garden.yml"

const createProjectArgs = {}
const createProjectOpts = {
  dir: new PathParameter({
    help: "Directory to place the project in (defaults to current directory).",
    defaultValue: ".",
  }),
  filename: new StringParameter({
    help: "Filename to place the project config in (defaults to project.garden.yml).",
    defaultValue: defaultProjectConfigFilename,
  }),
  interactive: new BooleanParameter({
    alias: "i",
    help: "Set to false to disable interactive prompts.",
    defaultValue: true,
  }),
  name: new StringOption({
    help: "Name of the project (defaults to current directory name).",
  }),
}

type CreateProjectArgs = typeof createProjectArgs
type CreateProjectOpts = typeof createProjectOpts

interface CreateProjectResult {
  configPath: string
  ignoreFileCreated: boolean
  ignoreFilePath: string
  name: string
}

class CreateError extends GardenBaseError {
  type: "create"
}

export class CreateProjectCommand extends Command<CreateProjectArgs, CreateProjectOpts> {
  name = "project"
  help = "Create a new Garden project."
  noProject = true
  cliOnly = true

  description = dedent`
    Creates a new Garden project configuration. The generated config includes some default values, as well as the
    schema of the config in the form of commentented-out fields. Also creates a default (blank) .gardenignore file
    in the same path.

    Examples:

        garden create project                     # create a Garden project config in the current directory
        garden create project --dir some-dir      # create a Garden project config in the ./some-dir directory
        garden create project --name my-project   # set the project name to my-project
        garden create project --interactive=false # don't prompt for user inputs when creating the config
  `

  arguments = createProjectArgs
  options = createProjectOpts

  getLoggerType(): LoggerType {
    return "basic"
  }

  async prepare({ headerLog }: PrepareParams<CreateProjectArgs, CreateProjectOpts>) {
    printHeader(headerLog, "Create new project", "pencil2")
    return { persistent: false }
  }

  async action({
    opts,
    log,
  }: CommandParams<CreateProjectArgs, CreateProjectOpts>): Promise<CommandResult<CreateProjectResult>> {
    const configDir = resolve(process.cwd(), opts.dir)

    if (!(await isDirectory(configDir))) {
      throw new ParameterError(`${configDir} is not a directory`, { configDir })
    }

    const configPath = join(configDir, opts.filename)

    // Throw if a project config already exists in the config path
    if (await pathExists(configPath)) {
      const configs = await loadConfigResources(configDir, configPath)

      if (configs.filter((c) => c.kind === "Project").length > 0) {
        throw new CreateError(`A Garden project already exists in ${configPath}`, { configDir, configPath })
      }
    }

    let name = opts.name || basename(configDir)

    if (opts.interactive && !opts.name) {
      log.root.stop()

      const answer = await inquirer.prompt({
        name: "name",
        message: "Project name:",
        type: "input",
        default: name,
      })

      name = answer.name

      log.info("")
    }

    const { yaml } = renderProjectConfigReference({
      yamlOpts: {
        commentOutEmpty: true,
        filterMarkdown: true,
        renderBasicDescription: true,
        renderFullDescription: false,
        renderValue: "preferExample",
        presetValues: {
          kind: "Project",
          name,
          environments: [{ name: "default" }],
          providers: [{ name: "local-kubernetes" }],
        },
      },
    })

    await addConfig(configPath, yaml)

    log.info(chalk.green(`-> Created new project config in ${chalk.bold.white(relative(process.cwd(), configPath))}`))

    const ignoreFilePath = resolve(configDir, ignorefileName)
    let ignoreFileCreated = false

    if (!(await pathExists(ignoreFilePath))) {
      const gitIgnorePath = resolve(configDir, ".gitignore")

      if (await pathExists(gitIgnorePath)) {
        await copyFile(gitIgnorePath, ignoreFilePath)
        const gitIgnoreRelPath = chalk.bold.white(relative(process.cwd(), ignoreFilePath))
        log.info(
          chalk.green(
            `-> Copied the .gitignore file at ${gitIgnoreRelPath} to a new .gardenignore in the same directory. Please edit the .gardenignore file if you'd like Garden to include or ignore different files.`
          )
        )
      } else {
        await writeFile(ignoreFilePath, defaultIgnorefile + "\n")
        const gardenIgnoreRelPath = chalk.bold.white(relative(process.cwd(), ignoreFilePath))
        log.info(
          chalk.green(
            `-> Created default .gardenignore file at ${gardenIgnoreRelPath}. Please edit the .gardenignore file to add files or patterns that Garden should ignore when scanning and building.`
          )
        )
      }

      ignoreFileCreated = true
    }

    log.info("")

    // This is to avoid `prettier` messing with the string formatting...
    const formattedIgnoreName = chalk.bold.white(".gardenignore")
    const configFilesUrl = chalk.cyan.underline("https://docs.garden.io/using-garden/configuration-overview")
    const referenceUrl = chalk.cyan.underline("https://docs.garden.io/reference/config")

    log.info({
      symbol: "info",
      msg: wordWrap(
        dedent`
        We recommend reviewing the generated config, uncommenting fields that you'd like to configure, and cleaning up any commented fields that you don't need to use. Also make sure to update the ${formattedIgnoreName} file with any files you'd like to exclude from the Garden project.

        For more information about Garden configuration files, please check out ${configFilesUrl}, and for a detailed reference, take a look at ${referenceUrl}.
        `,
        120
      ),
    })

    log.info("")

    return { result: { configPath, ignoreFileCreated, ignoreFilePath, name } }
  }
}
