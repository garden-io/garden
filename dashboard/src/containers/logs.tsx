/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import React, { useEffect, useCallback } from "react"

import PageError from "../components/page-error"
import Logs from "../components/logs"
import Spinner from "../components/spinner"
import { loadLogs } from "../api/actions"
import { ServiceLogEntry } from "@garden-io/core/build/src/types/plugin/service/getServiceLogs"
import { useApi } from "../hooks"

interface LogsLoaded {
  [serviceName: string]: ServiceLogEntry[]
}

export default () => {
  const {
    dispatch,
    store: { entities, requestStates },
  } = useApi()

  useEffect(() => {
    // We need this inside the hook for referential equality
    const serviceNames: string[] = Object.keys(entities.services).filter((serviceName) => {
      const service = entities.services[serviceName]
      return !(service.config.disabled || service.config.moduleDisabled)
    })

    const fetchData = async () => loadLogs(dispatch, serviceNames)

    if (!requestStates.logs.initLoadComplete && serviceNames.length) {
      fetchData()
    }
  }, [dispatch, requestStates.logs.initLoadComplete, entities.services])

  const handleRefresh = useCallback(
    (names: string[]) => {
      loadLogs(dispatch, names)
    },
    [dispatch]
  )

  if (requestStates.logs.error) {
    return <PageError error={requestStates.logs.error} />
  }

  if (!requestStates.logs.initLoadComplete) {
    return <Spinner />
  }

  const logs = entities.logs as LogsLoaded

  return <Logs onRefresh={handleRefresh} logs={logs} />
}
