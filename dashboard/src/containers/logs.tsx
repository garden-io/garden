/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import React, { useEffect, useCallback } from "react"

import PageError from "../components/page-error"
import Logs from "../components/logs"
import { useApi } from "../contexts/api"
import Spinner from "../components/spinner"
import { loadLogs } from "../api/actions"
import { useConfig } from "../util/hooks"

export default () => {
  const {
    dispatch,
    store: {
      entities: { logs, services },
      requestStates,
    },
  } = useApi()

  const serviceNames: string[] = Object.keys(services)

  useConfig(dispatch, requestStates.config)

  useEffect(() => {
    const fetchData = async () => loadLogs(dispatch, serviceNames)

    if (!(requestStates.logs.initLoadComplete || requestStates.logs.pending) && serviceNames.length) {
      fetchData()
    }
  }, [dispatch, requestStates.logs, serviceNames])

  if (!(requestStates.config.initLoadComplete && requestStates.logs.initLoadComplete)) {
    return <Spinner />
  }

  if (requestStates.config.error || requestStates.logs.error) {
    return (
      <PageError error={(requestStates.config.error || requestStates.logs.error)} />
    )
  }

  const handleRefresh = useCallback((names: string[]) => {
    loadLogs(dispatch, names)
  }, [dispatch])

  return (
    <Logs onRefresh={handleRefresh} logs={logs} />
  )
}
