/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import React from "react"

import { ConfigConsumer } from "../context/config"
import FetchContainer from "./fetch-container"

import { fetchLogs } from "../api"
// tslint:disable-next-line:no-unused (https://github.com/palantir/tslint/issues/4022)
import { FetchLogResponse } from "../api/types"

import Logs from "../components/logs"
import PageError from "../components/page-error"

export default () => (
  <FetchContainer<FetchLogResponse> ErrorComponent={PageError} fetchFn={fetchLogs}>
    {({ data: logs }) => (
      <ConfigConsumer>
        {({ config }) => (
          <Logs config={config} logs={logs} />
        )}
      </ConfigConsumer>
    )}
  </FetchContainer>
)
