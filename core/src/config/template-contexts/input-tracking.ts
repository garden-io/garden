/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

export type StaticValue = {
  value: unknown
}

export class TemplateExpression {
  constructor(public expression: string) {}
}

export interface TemplateExpressionInputs {
  [referencedVariableName: string]: TemplateExpression | StaticValue
}

export class ResolvedTemplateExpression {
  constructor(
    public expression: string,
    public value: unknown,
    public inputs: TemplateExpressionInputs
  ) {}
}

// # action config run.shared-vars
// var.bar: {
//   key1:
//     nested: "${local.env.PREFIX}-${local.env.FOO}",
//   key2: "${local.env.PREFIX}-${actions.deploy.postgres.outputs.database-url}"
// }
// -> var.bar: {
//   key1:
//     nested: TExpr_1 = {
//       value: "prefix-apple",
//       inputs: { "local.env.PREFIX": "prefix", "local.env.FOO": "apple" },
//       partial: false,
//     },
//   key2: TExpr_2 = {
//     value: "prefix-${actions.deploy.postgres.outputs.database-url}",
//     inputs: { "local.env.PREFIX": "prefix" },
//     partial: true,
//   }
// }

// # some other action config
// var:
//   actionVar1: ${actions.run.shared-vars.bar.key1}
//   actionVar2: ${actions.run.shared-vars.bar.key2}
// ->
// var:
//   actionVar1: TExpr_3 = {
//     value: { nested: TExpr_1 },
//     inputs: { "actions.run.shared-vars.bar.key1": { nested: TExpr_1 } },
//     partial: false,
//   }
//   actionVar2: TExpr_4 = {
//     value: TExpr_2,
//     inputs: { "actions.run.shared-vars.bar.key1": TExpr_2 }
//     partial: true
//   }
