/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { mapValues } from "lodash"
import { PluginActionDescriptions } from "../plugin"
import { baseHandlerSchema } from "./base/base"
import { DescribeActionType } from "./base/describe"
import { SuggestActions } from "./base/suggest"
import { ValidateAction } from "./base/validate"
import { BuildAction } from "./build/build"
import { GetBuildActionStatus } from "./build/getStatus"
import { PublishBuildAction } from "./build/publish"
import { RunBuildAction } from "./build/run"
import { DeleteDeploy } from "./deploy/delete"
import { ExecInDeploy } from "./deploy/exec"
import { GetDeployLogs } from "./deploy/getLogs"
import { GetDeployPortForward } from "./deploy/getPortForward"
import { GetDeployStatus } from "./deploy/getStatus"
import { HotReloadDeploy } from "./deploy/hotReload"
import { RunDeploy } from "./deploy/run"
import { StopDeployPortForward } from "./deploy/stopPortForward"
import { GetRunActionResult } from "./run/getResult"
import { RunAction } from "./run/run"
import { GetTestActionResult } from "./test/getResult"
import { TestAction } from "./test/run"

const baseHandlers = {
  describe: new DescribeActionType(),
  suggest: new SuggestActions(),
  validate: new ValidateAction(),
}

const descriptions = {
  build: {
    ...baseHandlers,
    build: new BuildAction(),
    getStatus: new GetBuildActionStatus(),
    publish: new PublishBuildAction(),
    run: new RunBuildAction(),
  },
  deploy: {
    ...baseHandlers,
    delete: new DeleteDeploy(),
    exec: new ExecInDeploy(),
    getLogs: new GetDeployLogs(),
    getPortForward: new GetDeployPortForward(),
    getStatus: new GetDeployStatus(),
    hotReload: new HotReloadDeploy(),
    run: new RunDeploy(),
    stopPortForward: new StopDeployPortForward(),
  },
  run: {
    ...baseHandlers,
    getResult: new GetRunActionResult(),
    run: new RunAction(),
  },
  test: {
    ...baseHandlers,
    getResult: new GetTestActionResult(),
    run: new TestAction(),
  },
}

interface ActionTypeHandlerDescriptions {
  build: PluginActionDescriptions
  deploy: PluginActionDescriptions
  run: PluginActionDescriptions
  test: PluginActionDescriptions
}

// It takes a short while to resolve all these schemas, so we cache the result
let _actionTypeHandlerDescriptions: ActionTypeHandlerDescriptions

export function getActionTypeHandlerDescriptions(): ActionTypeHandlerDescriptions {
  if (_actionTypeHandlerDescriptions) {
    return _actionTypeHandlerDescriptions
  }

  _actionTypeHandlerDescriptions = mapValues(descriptions, (byType) => {
    return mapValues(byType, (cls) => {
      return {
        description: cls.description,
        paramsSchema: cls.paramsSchema().keys({
          base: baseHandlerSchema(),
        }),
        resultSchema: cls.resultSchema(),
      }
    })
  })

  return _actionTypeHandlerDescriptions
}
