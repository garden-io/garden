/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { configureProvider, configSchema } from "./config"
import { createGardenPlugin } from "../../../plugin/plugin"
import { dedent } from "../../../util/string"
import { KubernetesProvider } from "../config"
import { joi, joiIdentifier } from "../../../config/common"

const providerUrl = "./kubernetes.md"
export const GARDEN_KUBERNETES_PROVIDER_NAME = "garden-kubernetes"

const outputsSchema = joi.object().keys({
  "app-namespace": joiIdentifier().required().description("The primary namespace used for resource deployments."),
  "default-hostname": joi
    .string()
    .description(
      "The dynamic hostname assigned to the ephemeral cluster automatically, when an ephemeral cluster is created."
    ),
})

export const gardenPlugin = () =>
  createGardenPlugin({
    name: GARDEN_KUBERNETES_PROVIDER_NAME,
    base: "kubernetes",
    docs: dedent`
    {% hint style="warning" %}
    This feature is still experimental and can be accessed starting from Garden **v0.13.14**.
    Please let us know if you encounter any issues.
    {% endhint %}

    The \`${GARDEN_KUBERNETES_PROVIDER_NAME}\` provider is a specialized version of the [\`kubernetes\` provider](${providerUrl}) that allows to deploy applications to one of the ephemeral Kubernetes clusters provided by Garden.

    For information about using ephemeral Kubernetes clusters, please refer to [Garden Managed Kubernetes Clusters guide](../../guides/garden-managed-kubernetes-clusters.md)
  `,
    configSchema: configSchema(),
    outputsSchema,
    handlers: {
      configureProvider,
    },
  })

export function isProviderGardenKubernetes(provider: KubernetesProvider) {
  return provider?.name === GARDEN_KUBERNETES_PROVIDER_NAME
}
