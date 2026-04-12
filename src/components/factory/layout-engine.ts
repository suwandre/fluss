import dagre from "@dagrejs/dagre"
import type { Edge, Node } from "@xyflow/react"

const NODE_WIDTH = 220
const NODE_HEIGHT = 200

type LayoutOptions = {
  nodesep?: number
  ranksep?: number
  rankdir?: "LR" | "TB"
}

export function layoutGraph<N extends Node = Node, E extends Edge = Edge>(
  nodes: N[],
  edges: E[],
  options: LayoutOptions = {},
): N[] {
  const g = new dagre.graphlib.Graph()

  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({
    rankdir: options.rankdir ?? "LR",
    nodesep: options.nodesep ?? 60,
    ranksep: options.ranksep ?? 200,
  })

  for (const node of nodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT })
  }

  for (const edge of edges) {
    g.setEdge(edge.source, edge.target)
  }

  dagre.layout(g)

  return nodes.map((node) => {
    const pos = g.node(node.id)
    return {
      ...node,
      position: {
        x: pos.x - NODE_WIDTH / 2,
        y: pos.y - NODE_HEIGHT / 2,
      },
    }
  })
}
