/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { joiArray, joi, joiVariables } from "./common"

export interface DashboardPage {
  title: string
  description: string
  url: string
  newWindow: boolean
  // TODO: allow nested sections
  // children: DashboardPage[]
}

export const dashboardPageSchema = joi.object().keys({
  title: joi
    .string()
    .max(32)
    .required()
    .description("The link title to show in the menu bar (max length 32)."),
  description: joi
    .string()
    .required()
    .description("A description to show when hovering over the link."),
  url: joi
    .string()
    .uri()
    .required()
    .description("The URL to open in the dashboard pane when clicking the link."),
  newWindow: joi
    .boolean()
    .default(false)
    .description("Set to true if the link should open in a new browser tab/window."),
})

export const dashboardPagesSchema = joiArray(dashboardPageSchema)
  .optional()
  .description("One or more pages to add to the Garden dashboard.")

export const environmentStatusSchema = joi
  .object()
  .keys({
    ready: joi
      .boolean()
      .required()
      .description("Set to true if the environment is fully configured for a provider."),
    dashboardPages: dashboardPagesSchema,
    detail: joi
      .object()
      .optional()
      .meta({ extendable: true })
      .description("Use this to include additional information that is specific to the provider."),
    outputs: joiVariables()
      .meta({ extendable: true })
      .description("Output variables that modules and other variables can reference."),
  })
  .description("Description of an environment's status for a provider.")
