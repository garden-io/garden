/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { containerLocalModeSchema, ContainerServiceSpec } from "../container/config"
import { gardenAnnotationKey } from "../../util/string"
import { set } from "lodash"
import { HotReloadableResource } from "./hot-reload/hot-reload"
import { PrimitiveMap } from "../../config/common"
import { PROXY_CONTAINER_SSH_TUNNEL_PORT } from "./constants"
import { ConfigurationError } from "../../exceptions"

// todo: build the image
//const proxyImageName = "gardendev/k8s-reverse-proxy:0.0.1"

export const builtInExcludes = ["/**/*.git", "**/*.garden"]

export const localModeGuideLink = "https://docs.garden.io/guides/..." // todo

interface ConfigureProxyContainerParams {
  enableLocalMode: boolean
  spec: ContainerServiceSpec
}

interface ConfigureLocalModeParams {
  target: HotReloadableResource
  containerName?: string
}

export const kubernetesLocalModeSchema = () => containerLocalModeSchema()

export function prepareLocalModeEnvVars({ enableLocalMode, spec }: ConfigureProxyContainerParams): PrimitiveMap {
  const localModeSpec = spec.localMode
  if (!enableLocalMode || !localModeSpec) {
    return {}
  }

  // todo: is it a good way to pick up the right port?
  const httpPortSpec = spec.ports.find((portSpec) => portSpec.name === "http")
  if (!httpPortSpec) {
    throw new ConfigurationError(`Could not find http port defined for service ${spec.name}`, spec.ports)
  }

  const proxyContainerSpec = localModeSpec.proxyContainer
  // const publicKey = fs.readFileSync(proxyContainerSpec.publicKeyFile).toString("utf-8")

  return {
    APP_PORT: httpPortSpec.containerPort,
    PUBLIC_KEY: proxyContainerSpec.publicKey,
    USER_NAME: proxyContainerSpec.username,
  }
}

export function configureLocalModeProxyContainer({ enableLocalMode, spec }: ConfigureProxyContainerParams): void {
  const localModeSpec = spec.localMode
  if (!enableLocalMode || !localModeSpec) {
    return
  }

  const hasSshPort = spec.ports.some((portSpec) => portSpec.name === "ssh")
  if (!hasSshPort) {
    spec.ports.push({
      name: "ssh",
      protocol: "TCP",
      containerPort: PROXY_CONTAINER_SSH_TUNNEL_PORT,
      servicePort: PROXY_CONTAINER_SSH_TUNNEL_PORT,
    })
  }
  if (!!spec.healthCheck) {
    delete spec.healthCheck // fixme: disabled health checks for proxy container, should those be enabled?
  }
}

/**
 * Configures the specified Deployment, DaemonSet or StatefulSet for local mode.
 */
export function configureLocalMode({ target }: ConfigureLocalModeParams): void {
  set(target, ["metadata", "annotations", gardenAnnotationKey("local-mode")], "true")
  // const mainContainer = getResourceContainer(target, containerName)
  // todo: check if anything should be configured here
}
