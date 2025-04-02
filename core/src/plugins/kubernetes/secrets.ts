/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { KubeApi } from "./api.js"
import { KubernetesError } from "./api.js"
import type { ProviderSecretRef } from "./config.js"
import { ConfigurationError } from "../../exceptions.js"
import { pick } from "lodash-es"
import type { Log } from "../../logger/log-entry.js"

/**
 * Read the specified secret ref from the cluster.
 */
export async function readSecret(api: KubeApi, secretRef: ProviderSecretRef) {
  try {
    return await api.core.readNamespacedSecret({ name: secretRef.name, namespace: secretRef.namespace })
  } catch (err) {
    if (!(err instanceof KubernetesError)) {
      throw err
    }
    if (err.responseStatusCode === 404) {
      throw new ConfigurationError({
        message:
          `Could not find secret '${secretRef.name}' in namespace '${secretRef.namespace}'. ` +
          `Have you correctly configured your secrets?`,
      })
    } else {
      throw err
    }
  }
}

/**
 * Make sure the specified secret exists in the target namespace, copying it if necessary.
 */
export async function ensureSecret(api: KubeApi, secretRef: ProviderSecretRef, targetNamespace: string, log: Log) {
  const secret = await readSecret(api, secretRef)

  if (secretRef.namespace === targetNamespace) {
    return
  }

  // Make sure we don't copy generated attributes
  secret.metadata = {
    ...pick(secret.metadata, ["name", "annotations", "labels"]),
    namespace: targetNamespace,
  }

  await api.upsert({ kind: "Secret", namespace: targetNamespace, obj: secret, log })
}

/**
 * Prepare references to the secrets given by the array of ProviderSecretRefs passed in.
 * These secrets will be copied to the given namespace if needed.
 */
export async function prepareSecrets({
  api,
  namespace,
  secrets,
  log,
}: {
  api: KubeApi
  namespace: string
  secrets: Array<ProviderSecretRef>
  log: Log
}) {
  if (!secrets) {
    return []
  }
  await Promise.all(secrets.map((s) => ensureSecret(api, s, namespace, log)))
  return secrets.map((s) => ({ name: s.name }))
}
