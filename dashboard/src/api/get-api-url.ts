/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { GARDEN_SERVICE_DEFAULT_PORT } from "../constants"

export default (): string => {
  if (process.env.NODE_ENV === "production") {
    return window.location.host
  }
  const port = process.env.REACT_APP_GARDEN_SERVICE_PORT || GARDEN_SERVICE_DEFAULT_PORT
  return `localhost:${port}`
}
