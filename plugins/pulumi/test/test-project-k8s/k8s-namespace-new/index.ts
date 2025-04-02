/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as pulumi from "@pulumi/pulumi"
import * as k8s from "@pulumi/kubernetes"

// Minikube does not implement services of type `LoadBalancer`; require the user to specify if we're
// running on minikube, and if so, create only services of type ClusterIP.
const config = new pulumi.Config()

const name = config.require("namespace")

const ns = new k8s.core.v1.Namespace(config.require("namespace"), { metadata: { name } })
export const namespace = ns.metadata.name
