/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { KubeApi } from "./api"
import { ProviderSecretRef, KubernetesPluginContext, KubernetesProvider } from "./config"
import { ConfigurationError } from "../../exceptions"
import { getMetadataNamespace } from "./namespace"
import { GetSecretParams } from "../../types/plugin/provider/getSecret"
import { SetSecretParams } from "../../types/plugin/provider/setSecret"
import { DeleteSecretParams } from "../../types/plugin/provider/deleteSecret"
import { pick } from "lodash"
import { LogEntry } from "../../logger/log-entry"

export async function getSecret({ ctx, log, key }: GetSecretParams) {
  const k8sCtx = <KubernetesPluginContext>ctx
  const api = await KubeApi.factory(log, k8sCtx.provider)
  const ns = await getMetadataNamespace(k8sCtx, log, k8sCtx.provider)

  try {
    const res = await api.core.readNamespacedSecret(key, ns)
    return { value: Buffer.from(res.data!.value, "base64").toString() }
  } catch (err) {
    if (err.statusCode === 404) {
      return { value: null }
    } else {
      throw err
    }
  }
}

export async function setSecret({ ctx, log, key, value }: SetSecretParams) {
  // we store configuration in a separate metadata namespace, so that configs aren't cleared when wiping the namespace
  const k8sCtx = <KubernetesPluginContext>ctx
  const api = await KubeApi.factory(log, k8sCtx.provider)
  const ns = await getMetadataNamespace(k8sCtx, log, k8sCtx.provider)
  const body = {
    body: {
      apiVersion: "v1",
      kind: "Secret",
      metadata: {
        name: key,
        annotations: {
          "garden.io/generated": "true",
        },
      },
      type: "exec",
      stringData: { value },
    },
  }

  try {
    await api.core.createNamespacedSecret(ns, <any>body)
  } catch (err) {
    if (err.statusCode === 409) {
      await api.core.patchNamespacedSecret(key, ns, body)
    } else {
      throw err
    }
  }

  return {}
}

export async function deleteSecret({ ctx, log, key }: DeleteSecretParams) {
  const k8sCtx = <KubernetesPluginContext>ctx
  const api = await KubeApi.factory(log, k8sCtx.provider)
  const ns = await getMetadataNamespace(k8sCtx, log, k8sCtx.provider)

  try {
    await api.core.deleteNamespacedSecret(key, ns, <any>{})
  } catch (err) {
    if (err.statusCode === 404) {
      return { found: false }
    } else {
      throw err
    }
  }
  return { found: true }
}

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
 * Prepare references to imagePullSecrets for use in Pod specs, and ensure they have been copied to the target
 * namespace.
 */
export async function prepareImagePullSecrets({
  api,
  provider,
  namespace,
  log,
}: {
  api: KubeApi
  provider: KubernetesProvider
  namespace: string
  log: LogEntry
}) {
  await Promise.all(provider.config.imagePullSecrets.map((s) => ensureSecret(api, s, namespace, log)))
  return provider.config.imagePullSecrets.map((s) => ({ name: s.name }))
}
