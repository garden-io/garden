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
const isMinikube = config.requireBoolean("isMinikube")
const appName = config.require("appName")
const orgName = config.require("orgName")
const stackRef = new pulumi.StackReference(`${orgName}/pulumi-k8s-test/k8s-namespace`)
const namespace = stackRef.getOutput("namespace")

const appLabels = { app: appName }

const deployment = new k8s.apps.v1.Deployment(appName, {
  metadata: { namespace, labels: appLabels },
  spec: {
    selector: { matchLabels: appLabels },
    replicas: 1,
    template: {
      metadata: { labels: appLabels },
      spec: { containers: [{ name: appName, image: "nginx" }] },
    },
  },
})

// Allocate an IP to the Deployment.
const service = new k8s.core.v1.Service(appName, {
  metadata: { labels: deployment.spec.template.metadata.labels, namespace },
  spec: {
    type: isMinikube ? "ClusterIP" : "LoadBalancer",
    ports: [{ port: 80, targetPort: 80, protocol: "TCP" }],
    selector: appLabels,
  },
})

export const deploymentName = deployment.metadata.name
export const serviceName = service.metadata.name
