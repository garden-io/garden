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
import { getServiceNames } from "../util/helpers"
import Spinner from "../components/spinner"

export default () => {
  const {
    actions: { loadConfig },
    store: { config },
  } = useContext(DataContext)

  useEffect(loadConfig, [])

  if (!config.data || config.loading) {
    return <Spinner />
  }

  return <LogsContainer />
}

const LogsContainer = () => {
  const {
    actions: { loadLogs },
    store: { config, logs },
  } = useContext(DataContext)

  useEffect(() => {
    if (config.data) {
      loadLogs(getServiceNames(config.data.moduleConfigs))
    }
  }, [])

  if (!logs.data || !config.data) {
    return <Spinner />
  }

  if (logs.error || config.error) {
    return <PageError />
  }

  return <Logs loadLogs={loadLogs} config={config.data} logs={logs.data} />
}
