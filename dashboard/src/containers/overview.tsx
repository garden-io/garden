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
import LoadWrapper from "../components/load-wrapper"

const LoadingServices = () => (
  <div className={cls(css`
      text-align: center;
    `, "mt-2")}>
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

  const isLoadingModules = !config.data || config.loading
  const isLoadingServices = !status.data || status.loading

  // Only show when load component for Modules is no longer visible
  const ServiceLoadMsg = isLoadingModules ? null : LoadingServices

  return (
    <div>
      <LoadWrapper error={config.error} ErrorComponent={PageError} loading={isLoadingModules}>
        <Modules modules={config.data && config.data.modules} />
      </LoadWrapper>
      <LoadWrapper
        error={status.error}
        LoadComponent={ServiceLoadMsg}
        ErrorComponent={PageError}
        loading={isLoadingServices}>
        <Services
          modules={config.data && config.data.modules}
          services={status.data && status.data.services}
        />
      </LoadWrapper>
    </div>
  )
}
