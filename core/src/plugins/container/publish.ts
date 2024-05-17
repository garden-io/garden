/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { ContainerBuildAction } from "./moduleConfig.js"
import { containerHelpers } from "./helpers.js"
import type { BuildActionHandler } from "../../plugin/action-types.js"
import { naturalList } from "../../util/string.js"

export const publishContainerBuild: BuildActionHandler<"publish", ContainerBuildAction> = async ({
  ctx,
  action,
  log,
  tagOverride,
}) => {
  const localImageId = action.getOutput("localImageId")
  const remoteImageId = containerHelpers.getPublicImageId(action, tagOverride)

  const taggedImages = [localImageId, remoteImageId]
  log.info({ msg: `Tagging images ${naturalList(taggedImages)}` })
  await containerHelpers.dockerCli({
    cwd: action.getBuildPath(),
    args: ["tag", ...taggedImages],
    log,
    ctx,
  })

  log.info({ msg: `Publishing image ${remoteImageId}...` })
  // TODO: stream output to log if at debug log level
  await containerHelpers.dockerCli({ cwd: action.getBuildPath(), args: ["push", remoteImageId], log, ctx })

  return {
    state: "ready",
    detail: { published: true, message: `Published ${remoteImageId}` },
    outputs: {
      localImageId,
      remoteImageId,
    },
  }
}
