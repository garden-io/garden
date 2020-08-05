/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { ContainerModule } from "./config"
import { PublishModuleParams } from "../../types/plugin/module/publishModule"
import { containerHelpers } from "./helpers"
import { ContainerProvider } from "./container"

export async function publishContainerModule({ ctx, module, log }: PublishModuleParams<ContainerModule>) {
  if (!(await containerHelpers.hasDockerfile(module))) {
    log.setState({ msg: `Nothing to publish` })
    return { published: false }
  }
  const containerProvider = ctx.provider as ContainerProvider

  const localId = await containerHelpers.getLocalImageId(module)
  const remoteId = await containerHelpers.getPublicImageId(module)

  log.setState({ msg: `Publishing image ${remoteId}...` })

  if (localId !== remoteId) {
    await containerHelpers.dockerCli({
      cwd: module.buildPath,
      args: ["tag", localId, remoteId],
      log,
      containerProvider,
    })
  }

  // TODO: stream output to log if at debug log level
  await containerHelpers.dockerCli({ cwd: module.buildPath, args: ["push", remoteId], log, containerProvider })

  return { published: true, message: `Published ${remoteId}` }
}
