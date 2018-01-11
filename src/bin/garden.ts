#!/usr/bin/env node
import { run } from "../cli"
import { shutdown } from "../util"
import { logException } from "../log"

run(process.argv)
  .then(() => {
    shutdown(0)
  })
  .catch((err) => {
    logException(err)
    shutdown(1)
  })
