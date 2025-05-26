/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

export type BaseNamespaceStatus = {
  pluginName: string
  namespaceName: string
}

type ReadyNamespaceStatus = BaseNamespaceStatus & {
  namespaceUid: string
  state: "ready"
}

type MissingNamespaceStatus = BaseNamespaceStatus & {
  namespaceUid: undefined
  state: "missing"
}

export type NamespaceStatus = ReadyNamespaceStatus | MissingNamespaceStatus

export function environmentToString({ environmentName, namespace }: { environmentName: string; namespace?: string }) {
  return namespace ? `${environmentName}.${namespace}` : environmentName
}
