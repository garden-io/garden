/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import React, { useContext, useEffect } from "react"

import PageError from "../components/page-error"
import Logs from "../components/logs"
import { DataContext } from "../context/data"
import Spinner from "../components/spinner"

export default () => {
  const {
    actions: { loadConfig, loadLogs },
    store: { entities: { logs, services }, requestStates: { fetchLogs, fetchConfig } },
  } = useContext(DataContext)

  const serviceNames: string[] = Object.keys(services)

  useEffect(() => {
    async function fetchData() {
      return await loadConfig()
    }
    // tslint:disable-next-line: no-floating-promises
    fetchData()
  }, [])

  useEffect(() => {
    async function fetchData() {
      return await loadLogs(serviceNames)
    }

    if (serviceNames.length) {
      // tslint:disable-next-line: no-floating-promises
      fetchData()
    }
  }, [fetchConfig.alreadyFetched]) // run again only after config had been fetched

  if (fetchConfig.loading || fetchLogs.loading) {
    return <Spinner />
  }
  if (fetchConfig.error || fetchLogs.error) {
    return (
      <PageError error={(fetchConfig.error || fetchLogs.error)} />
    )
  }

  return (
    <Logs onRefresh={loadLogs} logs={logs} />
  )
}
