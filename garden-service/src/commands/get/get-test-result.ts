/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { ConfigGraph } from "../../config-graph";
import {
  Command,
  CommandResult,
  CommandParams,
  StringParameter
} from "../base";
import { NotFoundError, ParameterError } from "../../exceptions";
import { TestResult } from "../../types/plugin/outputs";
import { getTestVersion } from "../../tasks/test";

import chalk from "chalk";
import { RunResult } from "../../types/plugin/outputs";
import { findByName, getNames } from "../../util/util";

import { prepareRuntimeContext } from "../../types/service";
import { logHeader } from "../../logger/util";
import { PushTask } from "../../tasks/push";

interface TestResultOutput {
  name: string;
  moduleName: string;
  startedAt: Date;
  completedAt: Date;
  version: string;
  output: string;
}

const getTestResultArgs = {
  module: new StringParameter({
    help: "The name of the module where the test runs.",
    required: true
  }),
  test: new StringParameter({
    help: "The name of the test.",
    required: true
  })
};

type Args = typeof getTestResultArgs;

export class GetTestResultCommand extends Command<Args> {
  name = "test-result";
  help = "Outputs the execution result of a provided test.";

  arguments = getTestResultArgs;

  async action({
    garden,
    log,
    args
  }: CommandParams<Args>): Promise<CommandResult<TestResultOutput>> {
    const testName = args.test;
    const moduleName = args.module;

    if (!testName) {
      const error = new ParameterError(
        `Failed to find test result, provided 'test' argument (test name) is cannot be empty.`,
        {}
      );
      return { errors: [error] };
    }

    if (!moduleName) {
      const error = new ParameterError(
        `Failed to find test result, provided 'module' argument (module name) is cannot be empty.`,
        {}
      );
      return { errors: [error] };
    }

    const graph = await garden.getConfigGraph();
    const module = await graph.getModule(moduleName);

    const testConfig = findByName(module.testConfigs, testName);

    if (!testConfig) {
      throw new ParameterError(
        `Could not find test "${testName}" in module ${moduleName}`,
        {
          moduleName,
          testName,
          availableTests: getNames(module.testConfigs)
        }
      );
    }

    logHeader({
      log,
      emoji: "runner",
      command: `Running test ${chalk.cyan(testName)} in module ${chalk.cyan(
        moduleName
      )}`
    });

    const testVersion = await getTestVersion(garden, graph, module, testConfig);

    const testResult: TestResult | null = await garden.actions.getTestResult({
      log,
      testName,
      module,
      testVersion: testVersion
    });

    if (testResult !== null) {
      const output: TestResultOutput = {
        name: testResult.testName,
        moduleName: testResult.moduleName,
        startedAt: testResult.startedAt,
        completedAt: testResult.completedAt,
        version: testResult.version.versionString,
        output: testResult.output
      };
      
      return { result: output };
    }

    const error = new NotFoundError(
      `failed to load test result for test '${testName}'`,
      { testName }
    );
    return { errors: [error] };
  }
}
