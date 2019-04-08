import React from "react";
import { PaneProps } from "./graph";
import { TaskResultNodeInfo } from "./task-result-node-info";
import { TestResultNodeInfo } from "./test-result-node-info";

export const NodeInfoPane: React.SFC<PaneProps> = ({ selectedGraphNodeId }) => {
  const [name, taskType] = selectedGraphNodeId.split("."); // TODO: replace with extracting this data from hashmap
  switch (taskType) {
    case "run": // task
      return <TaskResultNodeInfo name={name} />;
    case "test":
      return <TestResultNodeInfo name={name} module={""} />;
    case "build":
    default:
      return null;
  }
};
