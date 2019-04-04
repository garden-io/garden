import React, { useContext, useEffect } from "react";
import LoadWrapper from "../components/load-wrapper";
import { DataContext } from "../context/data";
import Card from "../components/card";
import Spinner from "../components/spinner";
import { PaneProps } from "./graph";
import { getEmojiByType } from "../util/helpers"

const TestPaneErrorMsg = () => <p>Error!</p>;
const TestPaneSpinner = () => <Spinner fontSize="10px" />;

export const TestPane: React.SFC<PaneProps> = ({ selectedGraphNode }) => {
  const {
    actions: { loadTaskResults },
    store: { taskResults }
  } = useContext(DataContext);
  const [name, taskType] = selectedGraphNode.split(".");
  useEffect(loadTaskResults, []);
  console.log(taskResults);
  const isLoading = !taskResults.data || taskResults.loading;
  return (
    <LoadWrapper
      loading={isLoading}
      error={taskResults.error}
      ErrorComponent={TestPaneErrorMsg}
      LoadComponent={TestPaneSpinner}
    >
      <Card>
        <div className="p-1">
          <h3>{name} {getEmojiByType(taskType)}</h3>
          <h4>{taskType}</h4>
          {taskResults.data}
        </div>
      </Card>
    </LoadWrapper>
  );
};
