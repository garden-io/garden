/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

export const RSYNC_PORT = 873
export const CLUSTER_REGISTRY_PORT = 5000
export const CLUSTER_REGISTRY_DEPLOYMENT_NAME = "garden-docker-registry"
export const MAX_CONFIGMAP_DATA_SIZE = 1024 * 1024 // max ConfigMap data size is 1MB
// max ConfigMap data size is 1MB but we need to factor in overhead, plus in some cases the log is duplicated in
// the outputs field, so we cap at 250kB.
export const MAX_RUN_RESULT_LOG_LENGTH = 250 * 1024

export const dockerAuthSecretName = "builder-docker-config"
export const dockerAuthSecretKey = ".dockerconfigjson"
export const inClusterRegistryHostname = "127.0.0.1:5000"
