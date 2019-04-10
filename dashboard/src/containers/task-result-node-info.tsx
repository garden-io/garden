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

interface TaskResultInfo {
  name: string;
  output: string | null;
  startedAt: string | null;
  completedAt: string | null;
  duration: string;
}

export const TaskResultNodeInfo: React.SFC<TaskResultNodeInfoProps> = ({
  name
}) => {
  const {
    actions: { loadTaskResult },
    store: { taskResult }
  } = useContext(DataContext);
  useEffect(() => loadTaskResult({ name }, true), [name]);
  const isLoading = !taskResult.data || taskResult.loading;

  let info: TaskResultInfo = null;

  if (!isLoading && taskResult.data) {
    info = {
      name,
      duration:
        taskResult.data.startedAt &&
        taskResult.data.completedAt &&
        timeConversion(
          new Date(taskResult.data.completedAt).valueOf() -
            new Date(taskResult.data.startedAt).valueOf()
        ),
      startedAt:
        taskResult.data.startedAt &&
        new Date(taskResult.data.startedAt).toLocaleString(),
      completedAt:
        taskResult.data.completedAt &&
        new Date(taskResult.data.completedAt).toLocaleString(),
      output: taskResult.data.output
    };
  }

  return (
    <LoadWrapper
      loading={isLoading}
      error={taskResult.error}
      ErrorComponent={TestPaneErrorMsg}
      LoadComponent={TestPaneSpinner}
    >
      {info && (
        <Card backgroundColor={colors.gardenGrayLighter}>
          <div className="p-1">
            <div className="row middle-xs col-xs-12">
              <div>
                <span className={cls(`garden-icon`, `garden-icon--task`)} />
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
                  {name}
                </h2>
              </div>
            </div>
            <div>
              <h4>type: Run</h4>
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
                  <NoResults>No task output</NoResults>
                )}
              </div>
            </div>
          </div>
        </Card>
      )}
    </LoadWrapper>
  );
};

export interface TaskResultNodeInfoProps {
  name: string; // task name
}
