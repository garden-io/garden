/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import React, { useEffect } from "react"

import PageError from "../components/page-error"
import Logs from "../components/logs"
import { useApi } from "../contexts/api"
import Spinner from "../components/spinner"

export default () => {
  const {
    actions,
    store: { entities: { logs, services }, requestStates: { fetchLogs, fetchConfig } },
  } = useApi()

  const serviceNames: string[] = Object.keys(services)

  useEffect(() => {
    async function fetchData() {
      return await actions.loadConfig()
    }
    fetchData()
  }, [])

  useEffect(() => {
    async function fetchData() {
      return await actions.loadLogs({ serviceNames })
    }

    if (serviceNames.length) {
      fetchData()
    }
  }, [fetchConfig.initLoadComplete]) // run again only after config had been fetched

  if (!(fetchConfig.initLoadComplete && fetchLogs.initLoadComplete)) {
    return <Spinner />
  }

  if (fetchConfig.error || fetchLogs.error) {
    return (
      <PageError error={(fetchConfig.error || fetchLogs.error)} />
    )
  }

  return (
    <Logs onRefresh={actions.loadLogs} logs={logs} />
  )
}
