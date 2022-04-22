/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { mapValues } from "lodash"
import { PluginActionDescriptions } from "./plugin"
import { baseHandlerSchema } from "./handlers/base/base"
import { DescribeActionType } from "./handlers/base/describe"
import { SuggestActions } from "./handlers/base/suggest"
import { ValidateAction } from "./handlers/base/validate"
import { BuildAction } from "./handlers/build/build"
import { GetBuildActionStatus } from "./handlers/build/getStatus"
import { PublishBuildAction } from "./handlers/build/publish"
import { RunBuildAction } from "./handlers/build/run"
import { DeleteDeploy } from "./handlers/deploy/delete"
import { ExecInDeploy } from "./handlers/deploy/exec"
import { GetDeployLogs } from "./handlers/deploy/getLogs"
import { GetDeployPortForward } from "./handlers/deploy/getPortForward"
import { GetDeployStatus } from "./handlers/deploy/getStatus"
import { HotReloadDeploy } from "./handlers/deploy/hotReload"
import { RunDeploy } from "./handlers/deploy/run"
import { StopDeployPortForward } from "./handlers/deploy/stopPortForward"
import { GetRunActionResult } from "./handlers/run/getResult"
import { RunAction } from "./handlers/run/run"
import { GetTestActionResult } from "./handlers/test/getResult"
import { TestAction } from "./handlers/test/run"

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
