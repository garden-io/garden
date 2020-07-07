/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { joi } from "../../../config/common"
import { readFileSync } from "fs-extra"
import { join } from "path"
import { STATIC_DIR } from "../../../constants"

export const volumeSchema = () => {
  // The JSON file is copied from the handy kubernetes-json-schema repo
  // (https://github.com/instrumenta/kubernetes-json-schema/tree/master/v1.17.0-standalone).
  const volumeJsonSchema = JSON.parse(readFileSync(join(STATIC_DIR, "kubernetes", "volume.json")).toString())

  return joi
    .customObject()
    .jsonSchema(volumeJsonSchema)
    .required()
    .description(
      "The spec for the volume reference. This has the exact same schema as the `volumes` field on a standard Kubernetes Pod spec. See https://v1-17.docs.kubernetes.io/docs/reference/generated/kubernetes-api/v1.17/#volume-v1-core for reference."
    )
}

export const volumeMountSchema = () => {
  // The JSON file is copied from the handy kubernetes-json-schema repo
  // (https://github.com/instrumenta/kubernetes-json-schema/tree/master/v1.17.0-standalone).
  const volumeMountJsonSchema = JSON.parse(readFileSync(join(STATIC_DIR, "kubernetes", "volumemount.json")).toString())

  return joi
    .customObject()
    .jsonSchema(volumeMountJsonSchema)
    .required()
    .description(
      "The spec for the volume mount. This has the exact same schema as the `volumeMounts` field on a standard Kubernetes container spec in a Pod spec. See https://v1-17.docs.kubernetes.io/docs/reference/generated/kubernetes-api/v1.17/#volumemount-v1-core for reference."
    )
}
