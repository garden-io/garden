/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import type { z, ZodSchema } from "zod"
import { aecStatusSchema } from "../config/aec.js"
import { s } from "../config/zod.js"

const gardenAnnotationPrefix = "garden.io/"

export const gardenAnnotationKeys: { [key: string]: ZodSchema } = {
  "action": s.string(),
  "action-type": s.identifier(),
  "aec-config": s.string(),
  "aec-force": s.string(),
  "aec-status": aecStatusSchema,
  "generated": s.string().datetime(),
  "helm-migrated": s.string(),
  "last-deployed": s.string().datetime(),
  "manifest-hash": s.string(),
  "mode": s.string(),
  "module": s.string(),
  "module-version": s.string(),
  "service": s.string(),
  "task": s.string(),
  "test": s.string(),
}

export type GardenAnnotations = typeof gardenAnnotationKeys
export type GardenAnnotationKey = keyof GardenAnnotations

export function gardenAnnotationKey(key: GardenAnnotationKey) {
  return gardenAnnotationPrefix + key
}

export function validateAnnotation<T extends GardenAnnotationKey>(key: T, value: z.infer<GardenAnnotations[T]>) {
  const schema = gardenAnnotationKeys[key]
  if (!schema) {
    return value
  }
  return schema.safeParse(value, {
    errorMap: (_issue, ctx) => {
      return {
        message: `Invalid value for annotation key ${key}: ${ctx.defaultError}`,
      }
    },
  })
}
