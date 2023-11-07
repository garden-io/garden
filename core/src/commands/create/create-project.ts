/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import dedent from "dedent"
import fsExtra from "fs-extra"
const { pathExists, writeFile, copyFile } = fsExtra
import type { CommandResult, CommandParams } from "../base.js"
import { Command } from "../base.js"
import { printHeader } from "../../logger/util.js"
import { isDirectory } from "../../util/fs.js"
import { loadConfigResources } from "../../config/base.js"
import { resolve, basename, relative, join } from "path"
import { GardenError, ParameterError } from "../../exceptions.js"
import { addConfig } from "./helpers.js"
import { wordWrap } from "../../util/string.js"
import { PathParameter, StringParameter, BooleanParameter, StringOption } from "../../cli/params.js"
import { userPrompt } from "../../util/util.js"
import { DOCS_BASE_URL, GardenApiVersion } from "../../constants.js"
import { styles } from "../../logger/styles.js"

const ignorefileName = ".gardenignore"
const defaultIgnorefile = dedent`
# Add paths here that you would like Garden to ignore when building modules and computing versions,
# using the same syntax as .gitignore files.
# For more info, see ${DOCS_BASE_URL}/using-garden/configuration-overview#including-excluding-files-and-directories
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
    aliases: ["i"],
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

class CreateError extends GardenError {
  type = "create" as const
}

export class CreateProjectCommand extends Command<CreateProjectArgs, CreateProjectOpts> {
  name = "project"
  help = "Create a new Garden project."
  override noProject = true
  override cliOnly = true

  override description = dedent`
    Creates a new Garden project configuration. The generated config includes some default values, as well as the
    schema of the config in the form of commented-out fields. Also creates a default (blank) .gardenignore file
    in the same path.

    Examples:

        garden create project                     # create a Garden project config in the current directory
        garden create project --dir some-dir      # create a Garden project config in the ./some-dir directory
        garden create project --name my-project   # set the project name to my-project
        garden create project --interactive=false # don't prompt for user inputs when creating the config
  `

  override arguments = createProjectArgs
  override options = createProjectOpts

  override printHeader({ log }) {
    printHeader(log, "Create new project", "✏️")
  }

  // Defining it like this because it'll stall on waiting for user input.
  override maybePersistent() {
    return true
  }

  override allowInDevCommand() {
    return false
  }

  async action({
    opts,
    log,
  }: CommandParams<CreateProjectArgs, CreateProjectOpts>): Promise<CommandResult<CreateProjectResult>> {
    const configDir = resolve(process.cwd(), opts.dir)

    if (!(await isDirectory(configDir))) {
      throw new ParameterError({ message: `${configDir} is not a directory` })
    }

    const configPath = join(configDir, opts.filename)

    // Throw if a project config already exists in the config path
    if (await pathExists(configPath)) {
      const configs = await loadConfigResources(log, configDir, configPath)

      if (configs.filter((c) => c.kind === "Project").length > 0) {
        throw new CreateError({
          message: `A Garden project already exists in ${configPath}`,
        })
      }
    }

    let name = opts.name || basename(configDir)

    if (opts.interactive && !opts.name) {
      const answer = await userPrompt({
        name: "name",
        message: "Project name:",
        type: "input",
        default: name,
      })

      name = answer.name

      log.info("")
    }
    const projectDocURL = `${DOCS_BASE_URL}/using-garden/projects`
    const projectReferenceURL = `${DOCS_BASE_URL}/reference/project-config`
    const providersReferenceURL = `${DOCS_BASE_URL}/reference/providers`
    const remoteK8sReferenceURL = `${DOCS_BASE_URL}/kubernetes-plugins/remote-k8s`
    const actionsGettingStartedURL = `${DOCS_BASE_URL}/using-garden/actions`
    const localKubernetesInstallationURL = `${DOCS_BASE_URL}/kubernetes-plugins/local-k8s/install`
    const yaml = dedent`
    # Documentation about Garden projects can be found at ${projectDocURL}
    # Reference for Garden projects can be found at ${projectReferenceURL}

    apiVersion: ${GardenApiVersion.v1}
    kind: Project
    name: ${name}

    defaultEnvironment: local

    # Environments typically represent different stages of your development and deployment process.
    environments:
      # Use this environment to develop in your local Kubernetes solution of choice.
      # Installation instructions and list of supported local Kubernetes environments: ${localKubernetesInstallationURL}
      - name: local
        defaultNamespace: garden-local

      # Use this environment to develop in remote, production-like environments that scale with your stack.
      # This means you don't need any dependencies on your local machine, even the builds can be performed remotely.
      # It enables sharing build and test caches with your entire team, which can significantly speed up pipelines and development.
      - name: remote
        defaultNamespace: garden-remote-${"${local.username}"}

      - name: staging
        # Ask before performing potentially destructive commands like "deploy".
        production: true
        defaultNamespace: staging

    # Providers make action types available in your Garden configuration and tell Garden how to connect with your infrastructure.
    # For example the kubernetes and local-kubernetes providers allow you to use the container, helm and kubernetes action types.
    # All available providers and their configuration options are listed in the reference docs: ${providersReferenceURL}
    providers:
      - name: local-kubernetes
        environments:
          - local

      # To configure the remote kubernetes providers, follow the steps at ${remoteK8sReferenceURL}
      - name: kubernetes
        environments:
          - remote
        context: # ... your remote development kubecontext here
      - name: kubernetes
        environments:
          - staging
        context: # ... your staging kubecontext here

    # Next step: Define actions to tell Garden how to build, test and deploy your code.
    # You can find out more here: ${actionsGettingStartedURL}
    `

    await addConfig(configPath, yaml)

    log.info(
      styles.success(`-> Created new project config in ${styles.bold.white(relative(process.cwd(), configPath))}`)
    )

    const ignoreFilePath = resolve(configDir, ignorefileName)
    let ignoreFileCreated = false

    if (!(await pathExists(ignoreFilePath))) {
      const gitIgnorePath = resolve(configDir, ".gitignore")

      if (await pathExists(gitIgnorePath)) {
        await copyFile(gitIgnorePath, ignoreFilePath)
        const gitIgnoreRelPath = styles.bold.white(relative(process.cwd(), ignoreFilePath))
        log.info(
          styles.success(
            `-> Copied the .gitignore file at ${gitIgnoreRelPath} to a new .gardenignore in the same directory. Please edit the .gardenignore file if you'd like Garden to include or ignore different files.`
          )
        )
      } else {
        await writeFile(ignoreFilePath, defaultIgnorefile + "\n")
        const gardenIgnoreRelPath = styles.bold.white(relative(process.cwd(), ignoreFilePath))
        log.info(
          styles.success(
            `-> Created default .gardenignore file at ${gardenIgnoreRelPath}. Please edit the .gardenignore file to add files or patterns that Garden should ignore when scanning and building.`
          )
        )
      }

      ignoreFileCreated = true
    }

    log.info("")

    // This is to avoid `prettier` messing with the string formatting...
    const configFilesUrl = styles.highlight.underline(`${DOCS_BASE_URL}/using-garden/configuration-overview`)
    const referenceUrl = styles.highlight.underline(projectReferenceURL)

    log.info(
      wordWrap(
        dedent`
        For more information about Garden configuration files, please check out ${configFilesUrl}, and for a detailed reference, take a look at ${referenceUrl}.
        `,
        120
      )
    )

    log.info("")

    return { result: { configPath, ignoreFileCreated, ignoreFilePath, name } }
  }
}
