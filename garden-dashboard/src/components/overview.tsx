/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import React from "react"

import Table from "./table"

import { FetchStatusResponse, ServiceStatus } from "../api"

interface Props {
  status: FetchStatusResponse
}

const Overview: React.SFC<Props> = ({ status }) => {
  return (
    <div>
      <Services services={status.services} />
    </div>
  )
}

interface ServicesProps {
  services: { [name: string]: ServiceStatus }
}

const Services: React.SFC<ServicesProps> = ({ services }) => {
  const rowHeaders = ["Name", "Status", "Endpoints"]
  const rows = Object.keys(services).map(service => [
    service,
    services[service].state,
    services[service].ingresses.map(i => i.path).join("\n"),
  ])
  return (
    <Table
      title="Services"
      rowHeaders={rowHeaders}
      rows={rows}
    />
  )
}

export default Overview
