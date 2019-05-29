/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import React, { useContext, useEffect } from "react"
import { DataContext } from "../context/data"
import { getDuration } from "../util/helpers"
import EntityResult from "../components/entity-result"
import { TaskResultOutput } from "garden-cli/src/commands/get/get-task-result"
import { TestResultOutput } from "garden-cli/src/commands/get/get-test-result"
import { ErrorNotification } from "../components/notifications"
import { EntityResultSupportedTypes } from "../context/ui"

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
    actions: { loadTestResult, loadTaskResult },
    store: { testResult, taskResult },
  } = useContext(DataContext)

  const loadResults = () => {
    if (type === "test") {
      loadTestResult({ name, module: moduleName }, true)
    } else if (type === "run" || type === "task") {
      loadTaskResult({ name }, true)
    }
  }

  useEffect(loadResults, [name, moduleName])

  // Here we just render the node data since only nodes of types test and run have results
  if (!(type === "test" || type === "run" || type === "task")) {
    return (
      <EntityResult
        onClose={onClose}
        name={name}
        type={type}
        moduleName={moduleName}
      />
    )
  }

  const result = type === "test" ? testResult : taskResult

  if (result.error) {
    return <ErrorMsg error={result.error} type={type} />
  }

  // Loading. Either data hasn't been loaded at all or cache contains stale data
  if (!result.data || result.data.name !== name) {
    return (
      <EntityResult
        onRefresh={loadResults}
        onClose={onClose}
        name={name}
        type={type}
        moduleName={moduleName}
      />
    )
  }

  // Render info pane with result data
  return (
    <EntityResult
      onRefresh={loadResults}
      loading={result.loading}
      onClose={onClose}
      name={name}
      type={type}
      moduleName={moduleName}
      {...prepareData(result.data)}
    />
  )
}
