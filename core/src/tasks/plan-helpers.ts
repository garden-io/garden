/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { Action, ActionKind } from "../actions/types.js"
import type { BaseTask, BaseActionTaskParams } from "./base.js"

type PlanTaskFactory = (params: BaseActionTaskParams<any>) => BaseTask

// Registry of plan task factories, populated when each plan task module is loaded
const planTaskFactories: Partial<Record<ActionKind, PlanTaskFactory>> = {}

/**
 * Registers a plan task factory for an action kind.
 * Called by each plan task module when it's loaded.
 */
export function registerPlanTaskFactory(kind: ActionKind, factory: PlanTaskFactory): void {
  planTaskFactories[kind] = factory
}

/**
 * Creates the appropriate plan task for an action.
 * Uses the registered factory for the action's kind.
 */
export function createPlanTaskForAction(
  action: Action,
  getDependencyParams: () => Omit<BaseActionTaskParams, "action" | "force">,
  forceActions: { kind: string; name: string }[]
): BaseTask {
  const force = !!forceActions.find((r) => r.kind === action.kind && r.name === action.name)
  const factory = planTaskFactories[action.kind]

  if (!factory) {
    throw new Error(`No plan task factory registered for action kind: ${action.kind}`)
  }

  return factory({
    ...getDependencyParams(),
    action,
    force,
  })
}
