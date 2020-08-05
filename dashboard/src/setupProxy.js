/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

// Proxy requests from the development server to the correct port on the core server.
// See: https://facebook.github.io/create-react-app/docs/proxying-api-requests-in-development#configuring-the-proxy-manually

// NOTE: This file must be named "src/setupProxy.js" and only supports Node's Javascript syntax.

const proxy = require("http-proxy-middleware")

const { GARDEN_SERVICE_DEFAULT_PORT } = require("./constants")

module.exports = function (app) {
  const port = process.env.REACT_APP_GARDEN_SERVICE_PORT || GARDEN_SERVICE_DEFAULT_PORT
  app.use(proxy('/api', { target: `http://localhost:${port}/` }))
  app.use(proxy('/download', { target: `http://localhost:${port}/` }))
};