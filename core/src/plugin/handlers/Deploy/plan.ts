/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { PluginDeployActionParamsBase } from "../../base.js"
import { actionParamsSchema } from "../../base.js"
import { dedent } from "../../../util/string.js"
import { createSchema, joi } from "../../../config/common.js"
import { ActionTypeHandlerSpec } from "../base/base.js"
import type { DeployAction } from "../../../actions/deploy.js"
import type { ActionState, Resolved } from "../../../actions/types.js"
import { actionStates } from "../../../actions/types.js"
import { joiVariables } from "../../../config/common.js"

type PlanDeployParams<T extends DeployAction> = PluginDeployActionParamsBase<T>

export interface ChangesSummary {
  create: number
  update: number
  delete: number
  unchanged: number
}

export interface ResourceChange {
  key: string
  operation: "create" | "update" | "delete" | "unchanged"
  /** Optional diff output showing what changed (for update operations) */
  diffOutput?: string
}

export interface PlanDeployResult {
  state: ActionState
  outputs: Record<string, any>
  planDescription: string
  changesSummary: ChangesSummary
  /** Optional list of individual resource changes for detailed reporting */
  resourceChanges?: ResourceChange[]
}

const changesSummarySchema = createSchema({
  name: "changes-summary",
  keys: () => ({
    create: joi.number().required().description("Number of resources to be created"),
    update: joi.number().required().description("Number of resources to be updated"),
    delete: joi.number().required().description("Number of resources to be deleted"),
    unchanged: joi.number().required().description("Number of resources that will remain unchanged"),
  }),
})

const resourceChangeSchema = createSchema({
  name: "resource-change",
  keys: () => ({
    key: joi.string().required().description("Unique identifier for the resource (e.g., Kind/namespace/name)"),
    operation: joi
      .string()
      .allow("create", "update", "delete", "unchanged")
      .only()
      .required()
      .description("The operation that would be performed"),
    diffOutput: joi
      .string()
      .allow("")
      .optional()
      .description("Diff output showing what changed (for update operations)"),
  }),
})

export const getPlanDeploySchema = createSchema({
  name: "plan-deploy",
  keys: () => ({
    state: joi
      .string()
      .allow(...actionStates)
      .only()
      .required()
      .description("The state of the action."),
    outputs: joiVariables().description("Runtime outputs that the deployment would produce"),
    planDescription: joi
      .string()
      .required()
      .description("Human-readable description of the changes that would be made"),
    changesSummary: changesSummarySchema().required().description("Summary of the changes that would be made"),
    resourceChanges: joi
      .array()
      .items(resourceChangeSchema())
      .optional()
      .description("List of individual resource changes"),
  }),
})

export class PlanDeploy<T extends DeployAction = DeployAction> extends ActionTypeHandlerSpec<
  "Deploy",
  PlanDeployParams<Resolved<T>>,
  PlanDeployResult
> {
  description = dedent`
    Generate a plan showing what changes would be made by deploying this action, without actually deploying.

    Called by the \`garden deploy --dry-run\` command.

    This handler should return a description of what the deployment would do, including any resources that would
    be created, updated, or deleted, as well as the runtime outputs that would be produced.
  `

  paramsSchema = () => actionParamsSchema()
  resultSchema = () => getPlanDeploySchema()
}
