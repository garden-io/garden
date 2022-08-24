/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import React, { useEffect } from "react"
import { Entities } from "../contexts/api"
import { getDuration } from "../util/helpers"
import EntityResult from "../components/entity-result"
import { ErrorNotification } from "../components/notifications"
import { loadTestResult, loadTaskResult } from "../api/actions"
import type { GetRunResultCommandResult } from "@garden-io/core/build/src/commands/get/get-run-result"
import type { GetTestResultCommandResult } from "@garden-io/core/build/src/commands/get/get-test-result"
import { useApi } from "../hooks"
import type { ActionKind } from "@garden-io/core/build/src/plugin/action-types"

const ErrorMsg = ({ error, type }) => (
  <ErrorNotification>
    Error occured while trying to get {type} result: {error.message}
  </ErrorNotification>
)

function prepareData(data?: GetRunResultCommandResult | GetTestResultCommandResult) {
  if (!data) {
    return {}
  }

  const startedAt = data.detail?.startedAt
  const completedAt = data.detail?.completedAt
  const duration = startedAt && completedAt && getDuration(startedAt, completedAt)

  return {
    duration,
    startedAt,
    completedAt,
    output: data.detail?.log,
    artifacts: data.artifacts,
  }
}

interface Props {
  kind: ActionKind
  name: string
  moduleName?: string
  cardProps?: any
  onClose: () => void
}

function isEntityDisabled({ name, kind, entities }: { name: string; kind: ActionKind; entities: Entities }) {
  const entity = entities.actions[kind][name]
  return entity.config.disabled
}

/**
 * Returns the InfoPane for a given node type.
 *
 * If the node is of type "test" or "run", it loads the results as well.
 */
export default ({ name, moduleName, kind, onClose, cardProps }: Props) => {
  const {
    dispatch,
    store: { entities, requestStates },
  } = useApi()
  const disabled = isEntityDisabled({ name, kind, entities })

  const loadResults = () => {
    if (disabled) {
      return
    }
    if (kind === "Test") {
      loadTestResult({ dispatch, name })
    } else if (kind === "Run") {
      loadTaskResult({ name, dispatch })
    }
  }

  useEffect(loadResults, [name, moduleName, disabled])

  if (disabled) {
    return null
  }

  const entity = entities[kind][name]

  if (kind === "Test") {
    if (requestStates.testResult.error) {
      return <ErrorMsg error={requestStates.testResult.error} type={kind} />
    }

    const results = prepareData(entity.result)

    return (
      <EntityResult
        onRefresh={loadResults}
        loading={requestStates.testResult.pending}
        onClose={onClose}
        name={name}
        kind={kind}
        moduleName={moduleName}
        cardProps={cardProps}
        {...results}
      />
    )
  } else if (kind === "Run") {
    const taskResult = entity.result

    if (requestStates.taskResult.error) {
      return <ErrorMsg error={requestStates.taskResult.error} type={kind} />
    }

    const results = prepareData(taskResult)

    return (
      <EntityResult
        onRefresh={loadResults}
        loading={requestStates.taskResult.pending}
        onClose={onClose}
        name={name}
        kind={kind}
        moduleName={moduleName}
        cardProps={cardProps}
        {...results}
      />
    )
  } else {
    return <EntityResult onClose={onClose} name={name} kind={kind} moduleName={moduleName} />
  }
}
