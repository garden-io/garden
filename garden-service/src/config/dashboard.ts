/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Joi = require("joi")
import { joiArray } from "./common"

export interface DashboardPage {
  title: string
  description: string
  url: string
  newWindow: boolean
  // TODO: allow nested sections
  // children: DashboardPage[]
}

export const dashboardPageSchema = Joi.object()
  .keys({
    title: Joi.string()
      .max(32)
      .required()
      .description("The link title to show in the menu bar (max length 32)."),
    description: Joi.string()
      .required()
      .description("A description to show when hovering over the link."),
    url: Joi.string()
      .uri()
      .required()
      .description("The URL to open in the dashboard pane when clicking the link."),
    newWindow: Joi.boolean()
      .default(false)
      .description("Set to true if the link should open in a new browser tab/window."),
  })

export const dashboardPagesSchema = joiArray(dashboardPageSchema)
  .description("One or more pages to add to the Garden dashboard.")
