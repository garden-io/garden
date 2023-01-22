/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { KubeApi } from "./api"
import { ProviderSecretRef } from "./config"
import { ConfigurationError } from "../../exceptions"
import { pick } from "lodash"
import { LogEntry } from "../../logger/log-entry"

/**
 * Read the specified secret ref from the cluster.
 */
export async function readSecret(api: KubeApi, secretRef: ProviderSecretRef) {
  try {
    return await api.core.readNamespacedSecret(secretRef.name, secretRef.namespace)
  } catch (err) {
    if (err.statusCode === 404) {
      throw new ConfigurationError(
        `Could not find secret '${secretRef.name}' in namespace '${secretRef.namespace}'. ` +
          `Have you correctly configured your secrets?`,
        {
          secretRef,
        }
      )
    } else {
      throw err
    }
  }
}

/**
 * Make sure the specified secret exists in the target namespace, copying it if necessary.
 */
export async function ensureSecret(api: KubeApi, secretRef: ProviderSecretRef, targetNamespace: string, log: LogEntry) {
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
  log: LogEntry
}) {
  await Promise.all(secrets.map((s) => ensureSecret(api, s, namespace, log)))
  return secrets.map((s) => ({ name: s.name }))
}
