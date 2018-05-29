/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Command } from "./base"
import { BuildCommand } from "./build"
import { CallCommand } from "./call"
import { ConfigCommand } from "./config"
import { DeployCommand } from "./deploy"
import { DevCommand } from "./dev"
import { EnvironmentCommand } from "./environment"
import { LoginCommand } from "./login"
import { LogoutCommand } from "./logout"
import { LogsCommand } from "./logs"
import { PushCommand } from "./push"
import { RunCommand } from "./run"
import { ScanCommand } from "./scan"
import { StatusCommand } from "./status"
import { TestCommand } from "./test"
import { ValidateCommand } from "./validate"

export const coreCommands: Command[] = [
  new BuildCommand(),
  new CallCommand(),
  new ConfigCommand(),
  new DeployCommand(),
  new DevCommand(),
  new EnvironmentCommand(),
  new LoginCommand(),
  new LogoutCommand(),
  new LogsCommand(),
  new PushCommand(),
  new RunCommand(),
  new ScanCommand(),
  new StatusCommand(),
  new TestCommand(),
  new ValidateCommand(),
]
