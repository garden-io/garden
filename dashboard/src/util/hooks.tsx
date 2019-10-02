/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { ApiDispatch, RequestState } from "../contexts/api"
import { useEffect } from "react"
import { loadConfig } from "../api/actions"

// This file contains common hooks that are used by multiple components.

/**
 * The hook for loading the config.
 */
export const useConfig = (dispatch: ApiDispatch, requestState: RequestState) => useEffect(() => {
  const fetchData = async () => loadConfig(dispatch)

  if (!(requestState.initLoadComplete || requestState.pending)) {
    fetchData()
  }
}, [dispatch, requestState])

/**
 * For effects that should only run once on mount. Bypasses the react-hooks/exhaustive-deps lint warning.
 *
 * However, this pattern may not be desirable and the overall topic is widely debated.
 * See e.g. here: https://github.com/facebook/react/issues/15865.
 * Here's the suggested solution: https://github.com/facebook/create-react-app/issues/6880#issuecomment-488158024
 */
export const useMountEffect = (fn: () => void) => useEffect(fn, [])
