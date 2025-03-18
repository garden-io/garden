/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { configureProvider, configSchema } from "./config.js"
import { createGardenPlugin } from "../../../plugin/plugin.js"
import { dedent } from "../../../util/string.js"
import type { KubernetesProvider } from "../config.js"
import { joi, joiIdentifier } from "../../../config/common.js"

const providerUrl = "./kubernetes.md"
export const EPHEMERAL_KUBERNETES_PROVIDER_NAME = "ephemeral-kubernetes"

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
    name: EPHEMERAL_KUBERNETES_PROVIDER_NAME,
    base: "kubernetes",
    docs: dedent`
    {% hint style="warning" %}
    This feature is still experimental and only available in Garden \`>=0.13.14\`. Please let us know if you have any questions or if any issues come up!
    {% endhint %}

    The \`${EPHEMERAL_KUBERNETES_PROVIDER_NAME}\` provider is a specialized version of the [\`kubernetes\` provider](${providerUrl}) that allows to deploy applications to one of the ephemeral Kubernetes clusters provided by Garden.
  `,
    configSchema: configSchema(),
    outputsSchema,
    handlers: {
      configureProvider,
    },
  })

export function isProviderEphemeralKubernetes(provider: KubernetesProvider) {
  return provider?.name === EPHEMERAL_KUBERNETES_PROVIDER_NAME
}
