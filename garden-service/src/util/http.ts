/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Axios, { AxiosRequestConfig } from "axios"
import SocksProxyAgent = require("socks-proxy-agent")

export function externalRequest(config: AxiosRequestConfig) {
  if (process.env.GARDEN_SOCKS_PROXY) {
    config.httpAgent = config.httpAgent || new SocksProxyAgent(process.env.GARDEN_SOCKS_PROXY)
    config.httpsAgent = config.httpsAgent || new SocksProxyAgent(process.env.GARDEN_SOCKS_PROXY)
  }

  return Axios(config)
}
