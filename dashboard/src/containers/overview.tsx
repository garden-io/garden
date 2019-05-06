/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import cls from "classnames"
import { css } from "emotion/macro"
import React, { useContext, useEffect } from "react"

import PageError from "../components/page-error"
import { Modules, Services } from "../components/overview"
import { DataContext } from "../context/data"
import Spinner from "../components/spinner"

const LoadingServices = () => (
  <div
    className={cls(css`
      text-align: center;
    `, "mt-2")}
  >
    <p>Loading services...</p>
  </div>
)

// Note: We render the overview page components individually so we that we don't
// have to wait for both API calls to return.
export default () => {
  const {
    actions: { loadConfig, loadStatus },
    store: { config, status },
  } = useContext(DataContext)

  useEffect(loadConfig, [])
  useEffect(loadStatus, [])

  const isLoadingConfig = !config.data || config.loading

  let modules: React.ReactNode = null
  let services: React.ReactNode = null

  if (config.error) {
    modules = <PageError />
  } else if (isLoadingConfig) {
    modules = <Spinner />
  } else if (config.data) {
    modules = <Modules moduleConfigs={config.data && config.data.moduleConfigs} />
  }

  if (status.error && !config.error) {
    // Only render error if config does not error. No need to display it twice.
    services = <PageError />
  } else if (!isLoadingConfig && (!status.data || status.loading)) {
    // Only show when load component for Modules is no longer visible
    services = <LoadingServices />
  } else if (status.data && config.data) {
    services = <Services moduleConfigs={config.data.moduleConfigs} services={status.data.services} />
  }

  return (
    <div>
      {modules}
      {services}
    </div>
  )
}
