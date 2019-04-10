import React, { useContext, useEffect } from "react";
import cls from "classnames";
import { css } from "emotion/macro";
import styled from "@emotion/styled/macro";
import LoadWrapper from "../components/load-wrapper";
import { DataContext } from "../context/data";
import Card from "../components/card";
import Spinner from "../components/spinner";
import { colors } from "../styles/variables";
import { timeConversion } from "../util/helpers";

const TestPaneErrorMsg = () => <p>Error!</p>;
const TestPaneSpinner = () => <Spinner fontSize="3px" />;
const Term = styled.div`
  background-color: ${colors.gardenBlack};
  color: white;
  border-radius: 2px;
  max-height: 45rem;
  overflow-y: auto;
  padding: 1rem;
`;
const Code = styled.code`
  word-break: break-word;
`;

const NoResults = styled.div`
  color: #721c24;
  background-color: #f8d7da;
  border-color: #f5c6cb;
  position: relative;
  padding: 0.75rem 1.25rem;
  margin-bottom: 1rem;
  border: 1px solid transparent;
  border-radius: 0.25rem;
`;

interface TestResultInfo {
  name: string
  output: string | null
  startedAt: string | null
  completedAt: string | null
  duration: string
}

export const TestResultNodeInfo: React.SFC<TestResultNodeInfoProps> = ({
  name,
  module
}) => {
  const {
    actions: { loadTestResult },
    store: { testResult }
  } = useContext(DataContext);
  useEffect(() => loadTestResult({ name, module }, true), []);
  const isLoading = !testResult.data || testResult.loading;

  let info: TestResultInfo = null;

  if (!isLoading && testResult.data ) {
    info = {
      name,
      duration:
        testResult.data.startedAt &&
        testResult.data.completedAt &&
        timeConversion(
          new Date(testResult.data.completedAt).valueOf() -
          new Date(testResult.data.startedAt).valueOf()
        ),
      startedAt:
        testResult.data.startedAt &&
        new Date(testResult.data.startedAt).toLocaleString(),
      completedAt:
        testResult.data.completedAt &&
        new Date(testResult.data.completedAt).toLocaleString(),
      output: testResult.data.output
    };
  }

  return (
    <LoadWrapper
      loading={isLoading}
      error={testResult.error}
      ErrorComponent={TestPaneErrorMsg}
      LoadComponent={TestPaneSpinner}
    >
      {info && (
        <Card backgroundColor={colors.gardenGrayLighter}>
          <div className="p-1">
            <div className="row middle-xs col-xs-12">
              <div>
                <span className={cls(`garden-icon`, `garden-icon--test`)} />
              </div>
              <div
                className={css`
                  padding-left: 0.5rem;
                `}
              >
                <h2
                  className={css`
                    margin-block-end: 0;
                  `}
                >
                  {info.name}
                </h2>
              </div>
            </div>
            <div>
              <h4>type: Test</h4>
            </div>
            {info.startedAt && (
              <div className="row">
                <div className="col-xs-6 pr-1">Started At:</div>
                <div className="col-xs-6">{info.startedAt}</div>
              </div>
            )}
            {info.completedAt && (
              <div className="row mt-1">
                <div className="col-xs-6 pr-1">Completed At:</div>
                <div className="col-xs-6">{info.completedAt}</div>
              </div>
            )}
            {info.duration && (
              <div className="row mt-1">
                <div className="col-xs-6 pr-1">Duration:</div>
                <div className="col-xs-6">{info.duration}</div>
              </div>
            )}

            <div className="row mt-1">
              <div className="col-xs-12 pb-1">Output:</div>
              <div className="col-xs-12 pb-1">
                {info.output ? (
                  <Term>
                    <Code>{info.output}</Code>
                  </Term>
                ) : (
                  <NoResults>No test output</NoResults>
                )}
              </div>
            </div>
          </div>
        </Card>
      )}
    </LoadWrapper>
  );
};

export interface TestResultNodeInfoProps {
  name: string; // test name
  module: string;
}
