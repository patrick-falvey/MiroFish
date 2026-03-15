import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import * as d3 from 'd3';
import type { GraphNode, GraphEdge } from '@/api/types';

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  node_count?: number;
  edge_count?: number;
}

interface SelectedNode {
  type: 'node';
  data: GraphNode;
  color: string;
  entityType: string;
}

interface SelfLoopGroup {
  isSelfLoopGroup: true;
  source_name: string;
  target_name: string;
  selfLoopCount: number;
  selfLoopEdges: Array<GraphEdge & { source_name?: string; target_name?: string }>;
}

interface SelectedEdge {
  type: 'edge';
  data: (GraphEdge & { source_name?: string; target_name?: string }) | SelfLoopGroup;
}

export type SelectedItem = SelectedNode | SelectedEdge;

interface EntityType {
  name: string;
  count: number;
  color: string;
}

interface GraphSimulationNode extends d3.SimulationNodeDatum {
  id: string;
  name: string;
  type: string;
  rawData: GraphNode;
  _dragStartX?: number;
  _dragStartY?: number;
  _isDragging?: boolean;
}

interface GraphSimulationLink extends d3.SimulationLinkDatum<GraphSimulationNode> {
  source: string | GraphSimulationNode;
  target: string | GraphSimulationNode;
  type: string;
  name: string;
  curvature: number;
  isSelfLoop: boolean;
  pairIndex?: number;
  pairTotal?: number;
  rawData: (GraphEdge & { source_name?: string; target_name?: string }) | SelfLoopGroup;
}

const COLORS = ['#FF6B35', '#004E89', '#7B2D8E', '#1A936F', '#C5283D', '#E9724C', '#3498db', '#9b59b6', '#27ae60', '#f39c12'];

export function useGraph(graphData: GraphData | null) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const simulationRef = useRef<d3.Simulation<GraphSimulationNode, GraphSimulationLink> | null>(null);
  const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(null);
  const [showEdgeLabels, setShowEdgeLabels] = useState(true);

  const entityTypes: EntityType[] = useMemo(() => {
    if (!graphData?.nodes) return [];
    const typeMap: Record<string, EntityType> = {};
    graphData.nodes.forEach(node => {
      const type = node.labels?.find(l => l !== 'Entity') || 'Entity';
      if (!typeMap[type]) {
        typeMap[type] = { name: type, count: 0, color: COLORS[Object.keys(typeMap).length % COLORS.length] };
      }
      typeMap[type].count++;
    });
    return Object.values(typeMap);
  }, [graphData]);

  const closeDetail = useCallback(() => setSelectedItem(null), []);

  const renderGraph = useCallback(() => {
    if (!svgRef.current || !containerRef.current || !graphData) return;

    if (simulationRef.current) {
      simulationRef.current.stop();
    }

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`);

    svg.selectAll('*').remove();

    const nodesData = graphData.nodes || [];
    const edgesData = graphData.edges || [];

    if (nodesData.length === 0) return;

    const nodeMap: Record<string, GraphNode> = {};
    nodesData.forEach(n => { nodeMap[n.uuid || n.id] = n; });

    const colorMap: Record<string, string> = {};
    entityTypes.forEach(t => { colorMap[t.name] = t.color; });
    const getColor = (type: string) => colorMap[type] || '#999';

    const nodes: GraphSimulationNode[] = nodesData.map(n => ({
      id: n.uuid || n.id,
      name: n.name || 'Unnamed',
      type: n.labels?.find((l: string) => l !== 'Entity') || 'Entity',
      rawData: n,
    }));

    const nodeIds = new Set(nodes.map(n => n.id));

    // Process edges: calculate curvature for parallel edges, group self-loops
    const edgePairCount: Record<string, number> = {};
    const selfLoopEdges: Record<string, Array<GraphEdge & { source_name?: string; target_name?: string }>> = {};
    const tempEdges = edgesData.filter(
      (e: any) => nodeIds.has(e.source_node_uuid) && nodeIds.has(e.target_node_uuid)
    );

    tempEdges.forEach((e: any) => {
      if (e.source_node_uuid === e.target_node_uuid) {
        if (!selfLoopEdges[e.source_node_uuid]) selfLoopEdges[e.source_node_uuid] = [];
        selfLoopEdges[e.source_node_uuid].push({
          ...e,
          source_name: nodeMap[e.source_node_uuid]?.name,
          target_name: nodeMap[e.target_node_uuid]?.name,
        });
      } else {
        const pairKey = [e.source_node_uuid, e.target_node_uuid].sort().join('_');
        edgePairCount[pairKey] = (edgePairCount[pairKey] || 0) + 1;
      }
    });

    const edgePairIndex: Record<string, number> = {};
    const processedSelfLoopNodes = new Set<string>();
    const edges: GraphSimulationLink[] = [];

    tempEdges.forEach((e: any) => {
      const isSelfLoop = e.source_node_uuid === e.target_node_uuid;

      if (isSelfLoop) {
        if (processedSelfLoopNodes.has(e.source_node_uuid)) return;
        processedSelfLoopNodes.add(e.source_node_uuid);
        const allSelfLoops = selfLoopEdges[e.source_node_uuid];
        const nodeName = nodeMap[e.source_node_uuid]?.name || 'Unknown';
        edges.push({
          source: e.source_node_uuid,
          target: e.target_node_uuid,
          type: 'SELF_LOOP',
          name: `Self Relations (${allSelfLoops.length})`,
          curvature: 0,
          isSelfLoop: true,
          rawData: {
            isSelfLoopGroup: true,
            source_name: nodeName,
            target_name: nodeName,
            selfLoopCount: allSelfLoops.length,
            selfLoopEdges: allSelfLoops,
          },
        });
        return;
      }

      const pairKey = [e.source_node_uuid, e.target_node_uuid].sort().join('_');
      const totalCount = edgePairCount[pairKey];
      const currentIndex = edgePairIndex[pairKey] || 0;
      edgePairIndex[pairKey] = currentIndex + 1;
      const isReversed = e.source_node_uuid > e.target_node_uuid;

      let curvature = 0;
      if (totalCount > 1) {
        const curvatureRange = Math.min(1.2, 0.6 + totalCount * 0.15);
        curvature = ((currentIndex / (totalCount - 1)) - 0.5) * curvatureRange * 2;
        if (isReversed) curvature = -curvature;
      }

      edges.push({
        source: e.source_node_uuid,
        target: e.target_node_uuid,
        type: e.fact_type || e.name || 'RELATED',
        name: e.name || e.fact_type || 'RELATED',
        curvature,
        isSelfLoop: false,
        pairIndex: currentIndex,
        pairTotal: totalCount,
        rawData: {
          ...e,
          source_name: nodeMap[e.source_node_uuid]?.name,
          target_name: nodeMap[e.target_node_uuid]?.name,
        },
      });
    });

    // Simulation
    const simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(edges).id((d: any) => d.id).distance((d: any) => {
        const baseDistance = 150;
        const edgeCount = d.pairTotal || 1;
        return baseDistance + (edgeCount - 1) * 50;
      }))
      .force('charge', d3.forceManyBody().strength(-400))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide(50))
      .force('x', d3.forceX(width / 2).strength(0.04))
      .force('y', d3.forceY(height / 2).strength(0.04));

    simulationRef.current = simulation;

    const g = svg.append('g');

    // Zoom
    svg.call(
      d3.zoom<SVGSVGElement, unknown>()
        .extent([[0, 0], [width, height]])
        .scaleExtent([0.1, 4])
        .on('zoom', (event) => {
          g.attr('transform', event.transform);
        }) as any
    );

    // Helper functions for curved paths
    const getLinkPath = (d: any) => {
      const sx = d.source.x, sy = d.source.y;
      const tx = d.target.x, ty = d.target.y;

      if (d.isSelfLoop) {
        const loopRadius = 30;
        const x1 = sx + 8, y1 = sy - 4;
        const x2 = sx + 8, y2 = sy + 4;
        return `M${x1},${y1} A${loopRadius},${loopRadius} 0 1,1 ${x2},${y2}`;
      }

      if (d.curvature === 0) return `M${sx},${sy} L${tx},${ty}`;

      const dx = tx - sx, dy = ty - sy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const pairTotal = d.pairTotal || 1;
      const offsetRatio = 0.25 + pairTotal * 0.05;
      const baseOffset = Math.max(35, dist * offsetRatio);
      const offsetX = -dy / dist * d.curvature * baseOffset;
      const offsetY = dx / dist * d.curvature * baseOffset;
      const cx = (sx + tx) / 2 + offsetX;
      const cy = (sy + ty) / 2 + offsetY;
      return `M${sx},${sy} Q${cx},${cy} ${tx},${ty}`;
    };

    const getLinkMidpoint = (d: any) => {
      const sx = d.source.x, sy = d.source.y;
      const tx = d.target.x, ty = d.target.y;

      if (d.isSelfLoop) return { x: sx + 70, y: sy };
      if (d.curvature === 0) return { x: (sx + tx) / 2, y: (sy + ty) / 2 };

      const dx = tx - sx, dy = ty - sy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const pairTotal = d.pairTotal || 1;
      const offsetRatio = 0.25 + pairTotal * 0.05;
      const baseOffset = Math.max(35, dist * offsetRatio);
      const offsetX = -dy / dist * d.curvature * baseOffset;
      const offsetY = dx / dist * d.curvature * baseOffset;
      const cx = (sx + tx) / 2 + offsetX;
      const cy = (sy + ty) / 2 + offsetY;
      return { x: 0.25 * sx + 0.5 * cx + 0.25 * tx, y: 0.25 * sy + 0.5 * cy + 0.25 * ty };
    };

    // Links
    const linkGroup = g.append('g').attr('class', 'links');

    const link = linkGroup.selectAll('path')
      .data(edges)
      .enter().append('path')
      .attr('stroke', '#C0C0C0')
      .attr('stroke-width', 1.5)
      .attr('fill', 'none')
      .style('cursor', 'pointer')
      .on('click', (event: any, d: any) => {
        event.stopPropagation();
        linkGroup.selectAll('path').attr('stroke', '#C0C0C0').attr('stroke-width', 1.5);
        d3.select(event.target).attr('stroke', '#3498db').attr('stroke-width', 3);
        setSelectedItem({ type: 'edge', data: d.rawData });
      });

    // Link label backgrounds
    const linkLabelBg = linkGroup.selectAll('rect')
      .data(edges)
      .enter().append('rect')
      .attr('fill', 'rgba(255,255,255,0.95)')
      .attr('rx', 3)
      .attr('ry', 3)
      .style('cursor', 'pointer')
      .style('pointer-events', 'all')
      .style('display', showEdgeLabels ? 'block' : 'none')
      .on('click', (event: any, d: any) => {
        event.stopPropagation();
        linkGroup.selectAll('path').attr('stroke', '#C0C0C0').attr('stroke-width', 1.5);
        link.filter((l: any) => l === d).attr('stroke', '#3498db').attr('stroke-width', 3);
        setSelectedItem({ type: 'edge', data: d.rawData });
      });

    // Link labels
    const linkLabels = linkGroup.selectAll('text')
      .data(edges)
      .enter().append('text')
      .text((d: any) => d.name)
      .attr('font-size', '9px')
      .attr('fill', '#666')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .style('cursor', 'pointer')
      .style('pointer-events', 'all')
      .style('font-family', 'system-ui, sans-serif')
      .style('display', showEdgeLabels ? 'block' : 'none')
      .on('click', (event: any, d: any) => {
        event.stopPropagation();
        linkGroup.selectAll('path').attr('stroke', '#C0C0C0').attr('stroke-width', 1.5);
        link.filter((l: any) => l === d).attr('stroke', '#3498db').attr('stroke-width', 3);
        setSelectedItem({ type: 'edge', data: d.rawData });
      });

    // Nodes
    const nodeGroup = g.append('g').attr('class', 'nodes');

    const node = nodeGroup.selectAll('circle')
      .data(nodes)
      .enter().append('circle')
      .attr('r', 10)
      .attr('fill', (d: any) => getColor(d.type))
      .attr('stroke', '#fff')
      .attr('stroke-width', 2.5)
      .style('cursor', 'pointer')
      .call(
        d3.drag<SVGCircleElement, any>()
          .on('start', (event: any, d: any) => {
            d.fx = d.x;
            d.fy = d.y;
            d._dragStartX = event.x;
            d._dragStartY = event.y;
            d._isDragging = false;
          })
          .on('drag', (event: any, d: any) => {
            const dx = event.x - d._dragStartX;
            const dy = event.y - d._dragStartY;
            if (!d._isDragging && Math.sqrt(dx * dx + dy * dy) > 3) {
              d._isDragging = true;
              simulation.alphaTarget(0.3).restart();
            }
            if (d._isDragging) {
              d.fx = event.x;
              d.fy = event.y;
            }
          })
          .on('end', (_event: any, d: any) => {
            if (d._isDragging) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
            d._isDragging = false;
          }) as any
      )
      .on('click', (event: any, d: any) => {
        event.stopPropagation();
        nodeGroup.selectAll('circle').attr('stroke', '#fff').attr('stroke-width', 2.5);
        d3.select(event.target).attr('stroke', '#3498db').attr('stroke-width', 3);
        setSelectedItem({
          type: 'node',
          data: d.rawData,
          color: getColor(d.type),
          entityType: d.type,
        });
      });

    // Node labels
    nodeGroup.selectAll('text')
      .data(nodes)
      .enter().append('text')
      .text((d: any) => d.name.length > 12 ? d.name.substring(0, 12) + '...' : d.name)
      .attr('font-size', '10px')
      .attr('fill', '#333')
      .attr('text-anchor', 'middle')
      .attr('dy', -16)
      .style('font-family', 'system-ui, sans-serif')
      .style('pointer-events', 'none');

    // Click background to deselect
    svg.on('click', () => {
      setSelectedItem(null);
      nodeGroup.selectAll('circle').attr('stroke', '#fff').attr('stroke-width', 2.5);
      linkGroup.selectAll('path').attr('stroke', '#C0C0C0').attr('stroke-width', 1.5);
    });

    // Cache bbox dimensions after first computation to avoid repeated DOM measurements
    const bboxCache = new Map<number, { width: number; height: number }>();

    // Tick — throttle expensive label bg updates to every 5th tick
    let tickCount = 0;
    simulation.on('tick', () => {
      link.attr('d', getLinkPath);

      tickCount++;
      // Update label positions every tick, but only measure bbox every 5 ticks
      const shouldMeasure = tickCount % 5 === 0 || tickCount <= 2;

      linkLabelBg.each(function (d: any, i: number) {
        const mid = getLinkMidpoint(d);
        let cached = bboxCache.get(i);
        if (!cached || shouldMeasure) {
          const textNode = linkLabels.filter((_: any, j: number) => j === i).node() as SVGTextElement | null;
          if (textNode) {
            const bbox = textNode.getBBox();
            cached = { width: bbox.width, height: bbox.height };
            bboxCache.set(i, cached);
          }
        }
        if (cached) {
          d3.select(this)
            .attr('x', mid.x - cached.width / 2 - 3)
            .attr('y', mid.y - cached.height / 2 - 1)
            .attr('width', cached.width + 6)
            .attr('height', cached.height + 2);
        }
      });

      linkLabels.attr('x', (d: any) => getLinkMidpoint(d).x)
        .attr('y', (d: any) => getLinkMidpoint(d).y);

      node.attr('cx', (d: any) => d.x).attr('cy', (d: any) => d.y);

      nodeGroup.selectAll('text')
        .attr('x', (d: any) => d.x)
        .attr('y', (d: any) => d.y);
    });

    // Stop the force simulation once it cools down to avoid wasting CPU
    simulation.alphaMin(0.05);
  }, [graphData, entityTypes, showEdgeLabels]);

  // Re-render when graphData changes
  useEffect(() => {
    if (graphData) renderGraph();
  }, [graphData, renderGraph]);

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      if (graphData) renderGraph();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [graphData, renderGraph]);

  // Cleanup simulation on unmount
  useEffect(() => {
    return () => {
      if (simulationRef.current) simulationRef.current.stop();
    };
  }, []);

  return {
    svgRef,
    containerRef,
    selectedItem,
    setSelectedItem,
    entityTypes,
    showEdgeLabels,
    setShowEdgeLabels,
    closeDetail,
    renderGraph,
  };
}
