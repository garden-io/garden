/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import deline = require("deline")
import * as Joi from "joi"
import {
  joiArray,
  joiIdentifier,
} from "./common"

export interface WorkflowSpec { }

export interface BaseWorkflowSpec extends WorkflowSpec {
  name: string
  dependencies: string[]
  timeout: number | null
}

export const baseWorkflowSpecSchema = Joi.object()
  .keys({
    name: joiIdentifier()
      .required()
      .description("The name of the task."),
    dependencies: joiArray(Joi.string())
      .description(deline`
        The names of any tasks that must be executed, and the names of any
        services that must be running, before this task is executed.
      `),
    timeout: Joi.number()
      .optional()
      .allow(null)
      .default(null)
      .description("Maximum duration (in seconds) of the task's execution."),
  })
  .description("Required configuration for module tasks.")

export interface WorkflowConfig<T extends WorkflowSpec = WorkflowSpec> extends BaseWorkflowSpec {
  // Plugins can add custom fields that are kept here
  spec: T
}

export const workflowConfigSchema = baseWorkflowSpecSchema
  .keys({
    spec: Joi.object()
      .meta({ extendable: true })
      .description("The task's specification, as defined by its provider plugin."),
  })
  .description("The configuration for a module's task.")

export const workflowSchema = Joi.object()
  .options({ presence: "required" })
  .keys({
    name: joiIdentifier()
      .description("The name of the task."),
    module: Joi.object().unknown(true),
    config: workflowConfigSchema,
    spec: Joi.object()
      .meta({ extendable: true })
      .description("The configuration of the task (specific to each plugin)."),
  })
