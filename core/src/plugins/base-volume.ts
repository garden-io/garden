/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { ModuleSpec } from "../config/module.js"
import { baseModuleSpecSchema } from "../config/module.js"
import { createSchema, joi } from "../config/common.js"
import { dedent } from "../util/string.js"
import { createGardenPlugin } from "../plugin/plugin.js"
import { memoize } from "lodash-es"

export type VolumeAccessMode = "ReadOnlyMany" | "ReadWriteOnce" | "ReadWriteMany"

export interface BaseVolumeSpec extends ModuleSpec {
  accessModes: VolumeAccessMode[]
}

export const accessModesSchemaKeys = memoize(() => ({
  accessModes: joi
    .sparseArray()
    .items(joi.string().allow("ReadOnlyMany", "ReadWriteOnce", "ReadWriteMany"))
    .unique()
    .min(1).description(dedent`
      A list of access modes supported by the volume when mounting. At least one must be specified. The available modes are as follows:

       ReadOnlyMany  - May be mounted as a read-only volume, concurrently by multiple targets.
       ReadWriteOnce - May be mounted as a read-write volume by a single target at a time.
       ReadWriteMany - May be mounted as a read-write volume, concurrently by multiple targets.

      At least one mode must be specified.
      `),
}))

export const baseVolumeSpecSchema = createSchema({
  name: "base-volume-spec",
  extend: baseModuleSpecSchema,
  keys: accessModesSchemaKeys,
})

export const gardenPlugin = () =>
  createGardenPlugin({
    name: "base-volume",
    createModuleTypes: [
      {
        name: "base-volume",
        docs: dedent`
        Internal abstraction used for specifying and referencing (usually persistent) volumes by other module types.
      `,
        schema: baseVolumeSpecSchema(),
        needsBuild: false,
        handlers: {},
      },
    ],
  })
