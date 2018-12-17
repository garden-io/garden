/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { V1Secret } from "@kubernetes/client-node"

import { KubeApi } from "./api"
import { SecretRef } from "./kubernetes"
import { ConfigurationError } from "../../exceptions"
import { GetSecretParams, SetSecretParams, DeleteSecretParams } from "../../types/plugin/params"
import { getMetadataNamespace } from "./namespace"

export async function getSecret({ ctx, key }: GetSecretParams) {
  const api = new KubeApi(ctx.provider)
  const ns = await getMetadataNamespace(ctx, ctx.provider)

  try {
    const res = await api.core.readNamespacedSecret(key, ns)
    return { value: Buffer.from(res.body.data.value, "base64").toString() }
  } catch (err) {
    if (err.code === 404) {
      return { value: null }
    } else {
      throw err
    }
  }
}

export async function setSecret({ ctx, key, value }: SetSecretParams) {
  // we store configuration in a separate metadata namespace, so that configs aren't cleared when wiping the namespace
  const api = new KubeApi(ctx.provider)
  const ns = await getMetadataNamespace(ctx, ctx.provider)
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
    if (err.code === 409) {
      await api.core.patchNamespacedSecret(key, ns, body)
    } else {
      throw err
    }
  }

  return {}
}

export async function deleteSecret({ ctx, key }: DeleteSecretParams) {
  const api = new KubeApi(ctx.provider)
  const ns = await getMetadataNamespace(ctx, ctx.provider)

  try {
    await api.core.deleteNamespacedSecret(key, ns, <any>{})
  } catch (err) {
    if (err.code === 404) {
      return { found: false }
    } else {
      throw err
    }
  }
  return { found: true }
}

/**
 * Make sure the specified secret exists in the target namespace, copying it if necessary.
 */
export async function ensureSecret(api: KubeApi, secretRef: SecretRef, targetNamespace: string) {
  let secret: V1Secret

  try {
    secret = (await api.core.readNamespacedSecret(secretRef.name, secretRef.namespace)).body
  } catch (err) {
    if (err.code === 404) {
      throw new ConfigurationError(
        `Could not find secret '${secretRef.name}' in namespace '${secretRef.namespace}'. ` +
        `Have you correctly configured your secrets?`,
        {
          secretRef,
        },
      )
    } else {
      throw err
    }
  }

  if (secretRef.namespace === targetNamespace) {
    return
  }

  delete secret.metadata.resourceVersion
  secret.metadata.namespace = targetNamespace

  await api.upsert("Secret", targetNamespace, secret)
}
