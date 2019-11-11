/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import React, { useEffect } from "react"
import { useApi } from "../contexts/api"
import { getDuration, getTestKey } from "../util/helpers"
import EntityResult from "../components/entity-result"
import { ErrorNotification } from "../components/notifications"
import { EntityResultSupportedTypes } from "../contexts/ui"
import { loadTestResult, loadTaskResult } from "../api/actions"
import { GetTaskResultCommandResult } from "garden-service/build/src/commands/get/get-task-result"
import { GetTestResultCommandResult } from "garden-service/build/src/commands/get/get-test-result"

const ErrorMsg = ({ error, type }) => (
  <ErrorNotification>
    Error occured while trying to get {type} result: {error.message}
  </ErrorNotification>
)

function prepareData(data: GetTaskResultCommandResult | GetTestResultCommandResult) {
  if (!data) {
    return {}
  }

  const startedAt = data.startedAt
  const completedAt = data.completedAt
  const duration = startedAt && completedAt && getDuration(startedAt, completedAt)

  return {
    duration,
    startedAt,
    completedAt,
    output: data.log,
    artifacts: data.artifacts,
  }
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
    dispatch,
    store: { entities, requestStates },
  } = useApi()

  const { tasks, tests } = entities

  const loadResults = () => {
    if (type === "test") {
      loadTestResult({ dispatch, name, moduleName })
    } else if (type === "run" || type === "task") {
      loadTaskResult({ name, dispatch })
    }
  }

  useEffect(loadResults, [name, moduleName])

  if (type === "test") {
    const testKey = getTestKey({ moduleName, testName: name })

    const test = tests[testKey]
    const testResult = test.result

    if (requestStates.testResult.error) {
      return <ErrorMsg error={requestStates.testResult.error} type={type} />
    }

    const results = prepareData(testResult)

    return (
      <EntityResult
        onRefresh={loadResults}
        loading={requestStates.testResult.pending}
        onClose={onClose}
        name={name}
        type={type}
        moduleName={moduleName}
        {...results}
      />
    )
  } else if (type === "task" || type === "run") {
    const task = tasks[name]
    const taskResult = task.result

    if (requestStates.taskResult.error) {
      return <ErrorMsg error={requestStates.taskResult.error} type={type} />
    }

    const results = prepareData(taskResult)

    return (
      <EntityResult
        onRefresh={loadResults}
        loading={requestStates.taskResult.pending}
        onClose={onClose}
        name={name}
        type={type}
        moduleName={moduleName}
        {...results}
      />
    )
  } else {
    return <EntityResult onClose={onClose} name={name} type={type} moduleName={moduleName} />
  }
}
