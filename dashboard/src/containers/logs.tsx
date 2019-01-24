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
import LoadWrapper from "../components/load-wrapper"
import { DataContext } from "../context/data"

export default () => {
  const {
    actions: { loadLogs, loadConfig },
    store: { config, logs },
  } = useContext(DataContext)

  useEffect(loadConfig, [])
  useEffect(loadLogs, [])

  const isLoading = !config.data || !logs.data || config.loading || logs.loading
  const error = config.error || logs.error

  return (
    <LoadWrapper error={error} ErrorComponent={PageError} loading={isLoading}>
      <Logs config={config.data} logs={logs.data} />
    </LoadWrapper>
  )
}
