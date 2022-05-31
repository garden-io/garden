/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

export const rsyncPort = 873
export const rsyncPortName = "garden-rsync"
export const buildSyncVolumeName = `garden-sync`

export const CLUSTER_REGISTRY_PORT = 5000
export const CLUSTER_REGISTRY_DEPLOYMENT_NAME = "garden-docker-registry"
export const MAX_CONFIGMAP_DATA_SIZE = 1024 * 1024 // max ConfigMap data size is 1MB
// max ConfigMap data size is 1MB but we need to factor in overhead, plus in some cases the log is duplicated in
// the outputs field, so we cap at 250kB.
export const MAX_RUN_RESULT_LOG_LENGTH = 250 * 1024

export const PROXY_CONTAINER_USER_NAME = "proxy-user"
export const PROXY_CONTAINER_SSH_TUNNEL_PORT = 2222

export const systemDockerAuthSecretName = "builder-docker-config"
export const dockerAuthSecretKey = ".dockerconfigjson"
export const inClusterRegistryHostname = "127.0.0.1:5000"

export const gardenUtilDaemonDeploymentName = "garden-util-daemon"
export const dockerDaemonDeploymentName = "garden-docker-daemon"

export const k8sUtilImageName = "gardendev/k8s-util:0.5.3"
export const k8sSyncUtilImageName = "gardendev/k8s-sync:0.1.4"
export const reverseProxyImageName = "gardendev/k8s-reverse-proxy:0.0.1"

export const dockerDaemonContainerName = "docker-daemon"
export const skopeoDaemonContainerName = "util"

export const defaultIngressClass = "nginx"
