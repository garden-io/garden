/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import React, { useEffect } from "react"
import { useApi } from "../contexts/api"
import { getDuration } from "../util/helpers"
import EntityResult from "../components/entity-result"
import { TaskResultOutput } from "garden-service/build/src/commands/get/get-task-result"
import { TestResultOutput } from "garden-service/build/src/commands/get/get-test-result"
import { ErrorNotification } from "../components/notifications"
import { EntityResultSupportedTypes } from "../contexts/ui"

const ErrorMsg = ({ error, type }) => (
  <ErrorNotification>
    Error occured while trying to get {type} result: {error.message}
  </ErrorNotification>
)

function prepareData(data: TestResultOutput | TaskResultOutput) {
  const startedAt = data.startedAt
  const completedAt = data.completedAt
  const duration =
    startedAt &&
    completedAt &&
    getDuration(startedAt, completedAt)

  const output = data.output
  return { duration, startedAt, completedAt, output }
}

interface Props {
  type: EntityResultSupportedTypes
  name: string
  moduleName: string
  onClose: () => void
}

/**
 * Returns the InfoPane for a given node type.
 *
 * If the node is of type "test" or "run", it loads the results as well.
 */
export default ({ name, moduleName, type, onClose }: Props) => {
  const {
    actions,
    store: { entities: { tasks, tests }, requestStates: { fetchTestResult, fetchTaskResult } },
  } = useApi()

  const loadResults = () => {
    if (type === "test") {
      actions.loadTestResult({ name, moduleName, force: true })
    } else if (type === "run" || type === "task") {
      actions.loadTaskResult({ name, force: true })
    }
  }

  useEffect(loadResults, [name, moduleName])

  if (type === "test") {
    const testResult = tests && tests[name] && tests[name].result

    if (fetchTestResult.error) {
      return <ErrorMsg error={fetchTestResult.error} type={type} />
    }

    return (
      <EntityResult
        onRefresh={loadResults}
        loading={fetchTestResult.loading}
        onClose={onClose}
        name={name}
        type={type}
        moduleName={moduleName}
        {...(!fetchTestResult.loading && testResult && prepareData(testResult))}
      />
    )

  } else if (type === "task" || type === "run") {
    const taskResult = tasks && tasks[name] && tasks[name].result

    if (fetchTaskResult.error) {
      return <ErrorMsg error={fetchTaskResult.error} type={type} />
    }

    return (
      <EntityResult
        onRefresh={loadResults}
        loading={fetchTaskResult.loading}
        onClose={onClose}
        name={name}
        type={type}
        moduleName={moduleName}
        {...(!fetchTaskResult.loading && taskResult && prepareData(taskResult))}

      />
    )
  } else {
    return (
      <EntityResult
        onClose={onClose}
        name={name}
        type={type}
        moduleName={moduleName}
      />
    )
  }
}
