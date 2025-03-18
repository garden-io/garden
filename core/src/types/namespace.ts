/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { z } from "zod";

const baseNamespaceStatusSchema = z.object({
  pluginName: z.string(),
  namespaceName: z.string(),
})

export const namespaceStatusSchema = z.discriminatedUnion("state", [
  baseNamespaceStatusSchema.extend({
    namespaceUid: z.string().uuid(),
    state: z.literal("ready"),
  }),
  baseNamespaceStatusSchema.extend({
    namespaceUid: z.undefined(),
    state: z.literal("missing"),
  }),
])

export type NamespaceStatus = z.infer<typeof namespaceStatusSchema>

export function environmentToString({ environmentName, namespace }: { environmentName: string; namespace?: string }) {
  return namespace ? `${environmentName}.${namespace}` : environmentName
}
