/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import {
  Command,
  CommandResult,
  CommandParams,
  StringParameter
} from "../base";
import * as yaml from "js-yaml";
import { NotFoundError, ParameterError } from "../../exceptions";
import { TestResult } from "../../types/plugin/outputs";
import { getTestVersion } from "../../tasks/test";
import { findByName, getNames, highlightYaml } from "../../util/util";
import { logHeader } from "../../logger/util";
import chalk from "chalk";

interface TestResultOutput {
  module: string;
  name: string;
  version: string | null;
  output: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
}

const getTestResultArgs = {
  module: new StringParameter({
    help: "The name of the module where the test runs.",
    required: true
  }),
  name: new StringParameter({
    help: "The name of the test.",
    required: true
  })
};

type Args = typeof getTestResultArgs;

export class GetTestResultCommand extends Command<Args> {
  name = "test-result";
  help = "Outputs the latest execution result of a provided test.";

  arguments = getTestResultArgs;

  async action({
    garden,
    log,
    args
  }: CommandParams<Args>): Promise<CommandResult<TestResultOutput>> {
    const testName = args.name;
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
      emoji: "heavy_check_mark",
      command: `Test result for ${chalk.cyan(testName)} in module ${chalk.cyan(
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
        module: testResult.moduleName,
        startedAt: testResult.startedAt,
        completedAt: testResult.completedAt,
        version: testResult.version.versionString,
        output: testResult.output
      };
      const yamlStatus = yaml.safeDump(testResult, {
        noRefs: true,
        skipInvalid: true
      });

      log.info(highlightYaml(yamlStatus));
      return { result: output };
    }

    const errorMessage = `Test '${testName}' was found but failed to load test result for it`
    log.info(errorMessage);

    const error = new NotFoundError(
      errorMessage,
      { testName }
    );
    return { errors: [error] };
  }
}
