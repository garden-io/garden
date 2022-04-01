/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { containerLocalModeSchema, ContainerLocalModeSpec } from "../container/config"
import { dedent, gardenAnnotationKey } from "../../util/string"
import { set } from "lodash"
import { HotReloadableResource } from "./hot-reload/hot-reload"
import { joi } from "../../config/common"

// todo: build the image
//const proxyImageName = "gardendev/k8s-proxy:0.0.1"

export const builtInExcludes = ["/**/*.git", "**/*.garden"]

export const localModeGuideLink = "https://docs.garden.io/guides/..." // todo

interface ConfigureLocalModeParams {
  target: HotReloadableResource
  spec: ContainerLocalModeSpec
  containerName?: string
}

export interface KubernetesLocalModeSpec extends ContainerLocalModeSpec {
  containerName?: string
}

export const kubernetesLocalModeSchema = () =>
  containerLocalModeSchema().keys({
    containerName: joi
      .string()
      .description(
        "The name of the remote k8s container in the relevant Pod spec that is to be replaced with the proxy server container."
      ),
  }).description(dedent`
    Specifies which service in the remote k8s cluster must be replaced by the local one.

    See the [Local mode guide](${localModeGuideLink}) for more information.
  `) // todo: link to the guide + guide itself

/**
 * Configures the specified Deployment, DaemonSet or StatefulSet for local mode.
 */
export function configureLocalMode({ target /*, service, containerName*/ }: ConfigureLocalModeParams): void {
  set(target, ["metadata", "annotations", gardenAnnotationKey("local-mode")], "true")
  // const mainContainer = getResourceContainer(target, containerName)
  // todo: check if anything should be configured here
}
