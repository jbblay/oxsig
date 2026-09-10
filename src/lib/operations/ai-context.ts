export type OperationAiNodeContext = {
  id: string;
  key: string;
  label: string;
  role: string;
  osFamily: string;
  status: string;
  privateIp: string | null;
  labInstanceId: string | null;
};

export type OperationAiRuntimeContext = {
  runId: string;
  operationSlug: string;
  operationMode: string;
  nodes: OperationAiNodeContext[];
  selectedNode: OperationAiNodeContext | null;
};
