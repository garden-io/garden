/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { ContainerModule } from "./config"
import { PublishModuleParams } from "../../types/plugin/module/publishModule"
import { containerHelpers } from "./helpers"

export async function publishContainerModule({ module, log }: PublishModuleParams<ContainerModule>) {
  if (!(await containerHelpers.hasDockerfile(module))) {
    log.setState({ msg: `Nothing to publish` })
    return { published: false }
  }

  const localId = await containerHelpers.getLocalImageId(module)
  const remoteId = await containerHelpers.getPublicImageId(module)

  log.setState({ msg: `Publishing image ${remoteId}...` })

  if (localId !== remoteId) {
    await containerHelpers.dockerCli(module, ["tag", localId, remoteId])
  }

  // TODO: stream output to log if at debug log level
  await containerHelpers.dockerCli(module, ["push", remoteId])

  return { published: true, message: `Published ${remoteId}` }
}
