import React, { useContext, useEffect } from "react";
import cls from "classnames";
import { css } from "emotion/macro";
import styled from "@emotion/styled/macro";
import LoadWrapper from "../components/load-wrapper";
import { DataContext } from "../context/data";
import Card from "../components/card";
import Spinner from "../components/spinner";
import graph, { PaneProps } from "./graph";
import { getIconClassNameByType } from "../util/helpers";
import { clearScreenDown } from "readline";
import { colors } from "../styles/variables";

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
export const TaskResultNodeInfo: React.SFC<TaskResultNodeInfoProps> = ({
  name
}) => {
  const {
    actions: { loadTaskResult },
    store: { taskResult }
  } = useContext(DataContext);
  useEffect(() => loadTaskResult({ name }, true), [name]);
  const isLoading = !taskResult.data || taskResult.loading;

  return (
    <LoadWrapper
      loading={isLoading}
      error={taskResult.error}
      ErrorComponent={TestPaneErrorMsg}
      LoadComponent={TestPaneSpinner}
    >
      <Card>
        <div className="p-1">
          <div className="row middle-xs col-xs-12">
            <div>
              <span
                className={cls(
                  `garden-icon`,
                  `garden-icon--task`
                )}
              />
            </div>
            <div
              className={css`
                padding-left: 0.5rem;
              `}
            >
              <h3
                className={css`
                  margin-block-end: 0;
                `}
              >
                {name}
              </h3>
            </div>
          </div>
          <div>
            <h4>type: Run</h4>
          </div>
          {taskResult.data && taskResult.data.output ? (
            <div>
              <div className="pb-1">Task result:</div>
              <Term>
                <Code>{taskResult.data.output}</Code>
              </Term>
            </div>
          ) : (
            <NoResults>
              No task result output were found
            </NoResults>
          )}
        </div>
      </Card>
    </LoadWrapper>
  );
};

export interface TaskResultNodeInfoProps {
  name: string; // task name
}
