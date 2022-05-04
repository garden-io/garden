/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import {
  Command,
  CommandParams,
  CommandResult,
  handleProcessResults,
  ProcessCommandResult,
  ProcessResultMetadata,
  prepareProcessResults,
  processCommandResultSchema,
  resultMetadataKeys,
} from "./base"
import { PublishTask } from "../tasks/publish"
import { printHeader } from "../logger/util"
import dedent = require("dedent")
import { PublishActionResult, publishResultSchema } from "../plugin/handlers/build/publish"
import { joiIdentifierMap } from "../config/common"
import { StringsParameter, BooleanParameter, StringOption } from "../cli/params"

export const publishArgs = {
  names: new StringsParameter({
    help:
      "The name(s) of the builds (or modules) to publish (skip to publish every build). " +
      "Use comma as a separator to specify multiple names.",
  }),
}

export const publishOpts = {
  "force-build": new BooleanParameter({
    help: "Force rebuild before publishing.",
  }),
  "tag": new StringOption({
    help:
      "Override the tag on the built artifacts. You can use the same sorts of template " +
      "strings as when templating values in configs, with the addition of " +
      "${build.*} tags, allowing you to reference the name and Garden version of the " +
      "module being tagged.",
  }),
}

type Args = typeof publishArgs
type Opts = typeof publishOpts

interface PublishCommandResult extends ProcessCommandResult {
  published: { [moduleName: string]: PublishActionResult & ProcessResultMetadata }
}

export class PublishCommand extends Command<Args, Opts> {
  name = "publish"
  help = "Build and publish artifacts (e.g. container images) to a remote registry."

  streamEvents = true

  description = dedent`
    Publishes built artifacts for all or specified builds. Also builds dependencies if needed.

    By default the artifacts/images are tagged with the Garden action version, but you can also specify the \`--tag\` option to specify a specific string tag _or_ a templated tag. Any template values that can be used on the build being tagged are available, in addition to ${"${build.name}"}, ${"${build.version}"} and ${"${build.hash}"} tags that allows referencing the name of the build being tagged, as well as its Garden version. ${"${build.version}"} includes the "v-" prefix normally used for Garden versions, and ${"${build.hash}"} doesn't.

    Examples:

        garden publish                # publish artifacts for all modules in the project
        garden publish my-container   # only publish my-container
        garden publish --force-build  # force re-build of modules before publishing artifacts

        # Publish my-container with a tag of v0.1
        garden publish my-container --tag "v0.1"

        # Publish my-container with a tag of v1.2-<hash> (e.g. v1.2-abcdef123)
        garden publish my-container --tag "v1.2-${"${build.hash}"}"
  `

  arguments = publishArgs
  options = publishOpts

  outputsSchema = () =>
    processCommandResultSchema().keys({
      published: joiIdentifierMap(publishResultSchema().keys(resultMetadataKeys())).description(
        "A map of all modules that were published (or scheduled/attempted for publishing) and the results."
      ),
    })

  printHeader({ headerLog }) {
    printHeader(headerLog, "Publish modules", "rocket")
  }

  async action({
    garden,
    log,
    footerLog,
    args,
    opts,
  }: CommandParams<Args, Opts>): Promise<CommandResult<PublishCommandResult>> {
    const graph = await garden.getConfigGraph({ log, emit: true })
    const builds = graph.getBuilds({ names: args.names })

    const tasks = builds.map((action) => {
      return new PublishTask({
        garden,
        graph,
        log,
        action,
        forceBuild: opts["force-build"],
        tagTemplate: opts.tag,
        devModeDeployNames: [],
        localModeDeployNames: [],
        fromWatch: false,
        force: false,
      })
    })

    const processed = await garden.processTasks({ tasks, log, throwOnError: true })
    const output = await handleProcessResults(footerLog, "publish", { graphResults: processed.results })

    return {
      ...output,
      result: {
        ...output.result!,
        published: prepareProcessResults("publish", output.result!.graphResults),
      },
    }
  }
}
