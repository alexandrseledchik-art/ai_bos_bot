import { CAUSAL_GRAPH_EDGES, CAUSAL_GRAPH_NODES } from "../../domain/causal-graph.js";

export function loadCausalGraph() {
  return {
    nodes: CAUSAL_GRAPH_NODES,
    edges: CAUSAL_GRAPH_EDGES
  };
}
