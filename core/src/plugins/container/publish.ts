/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { ContainerBuildAction } from "./moduleConfig.js"
import { containerHelpers } from "./helpers.js"
import type { BuildActionHandler } from "../../plugin/action-types.js"

export const publishContainerBuild: BuildActionHandler<"publish", ContainerBuildAction> = async ({
  ctx,
  action,
  log,
  tag,
}) => {
  const localId = action.getOutput("localImageId")
  const remoteId = containerHelpers.getPublicImageId(action, tag)

  if (localId !== remoteId) {
    log.info({ msg: `Tagging image with ${localId} and ${remoteId}` })
    await containerHelpers.dockerCli({
      cwd: action.getBuildPath(),
      args: ["tag", localId, remoteId],
      log,
      ctx,
    })
  }

  log.info({ msg: `Publishing image ${remoteId}...` })
  // TODO: stream output to log if at debug log level
  await containerHelpers.dockerCli({ cwd: action.getBuildPath(), args: ["push", remoteId], log, ctx })

  return {
    state: "ready",
    detail: { published: true, message: `Published ${remoteId}` },
    // TODO-0.13.1
    outputs: {},
  }
}
