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

export async function publishContainerModule({ ctx, module, log }: PublishModuleParams<ContainerModule>) {
  if (!containerHelpers.hasDockerfile(module, module.version)) {
    log.setState({ msg: `Nothing to publish` })
    return { published: false }
  }

  const localId = module.outputs["local-image-id"]
  const remoteId = containerHelpers.getPublicImageId(module)

  log.setState({ msg: `Publishing image ${remoteId}...` })

  if (localId !== remoteId) {
    await containerHelpers.dockerCli({
      cwd: module.buildPath,
      args: ["tag", localId, remoteId],
      log,
      ctx,
    })
  }

  // TODO: stream output to log if at debug log level
  await containerHelpers.dockerCli({ cwd: module.buildPath, args: ["push", remoteId], log, ctx })

  return { published: true, message: `Published ${remoteId}` }
}
