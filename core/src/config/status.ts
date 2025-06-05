/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { createSchema, joi, joiVariables } from "./common.js"

export const environmentStatusSchema = createSchema({
  name: "environment-status",
  description: "Description of an environment's status for a provider.",
  keys: () => ({
    ready: joi.boolean().required().description("Set to true if the environment is fully configured for a provider."),
    detail: joi
      .object()
      .optional()
      .meta({ extendable: true })
      .description("Use this to include additional information that is specific to the provider."),
    outputs: joiVariables()
      .meta({ extendable: true })
      .description("Output variables that modules and other variables can reference."),
    disableCache: joi.boolean().optional().description("Set to true to disable caching of the status."),
    cached: joi
      .boolean()
      .optional()
      .meta({ internal: true })
      .description("Indicates if the status was retrieved from cache by the framework."),
  }),
})
