/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import React, { useContext, useEffect } from "react"

import Graph from "../components/graph"
import PageError from "../components/page-error"
import { EventContext } from "../context/events"
import LoadWrapper from "../components/load-wrapper"
import { DataContext } from "../context/data"

export default () => {
  const {
    actions: { loadGraph, loadConfig },
    store: { config, graph },
  } = useContext(DataContext)
  const { message } = useContext(EventContext)

  useEffect(loadConfig, [])
  useEffect(loadGraph, [])

  const isLoading = !config.data || !graph.data || config.loading || graph.loading
  const error = config.error || graph.error

  return (
    <LoadWrapper error={error} ErrorComponent={PageError} loading={isLoading}>
      <Graph message={message} config={config.data} graph={graph.data} />
    </LoadWrapper>
  )
}
