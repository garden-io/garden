/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { z } from "zod"

export const namespaceStatusSchema = z.object({
  pluginName: z.string(),
  namespaceName: z.string(),
  state: z.union([z.literal("ready"), z.literal("missing")]),
})

// When needed, we can make this type generic and add e.g. a detail for plugin-specific metadata.
export type NamespaceStatus = z.infer<typeof namespaceStatusSchema>

export function environmentToString({ environmentName, namespace }: { environmentName: string; namespace?: string }) {
  return namespace ? `${environmentName}.${namespace}` : environmentName
}
