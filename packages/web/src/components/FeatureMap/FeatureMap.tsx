'use client';

import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';

export interface FeatureNode {
  id: string;
  label: string;
  children: FeatureNode[];
}

interface Props {
  features: FeatureNode[];
}

export default function FeatureMap({ features }: Props) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const svg = d3.select(ref.current);
    svg.selectAll('*').remove();

    const width = ref.current.clientWidth || 600;
    const height = ref.current.clientHeight || 384;
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(width, height) / 2 - 40;

    // Build hierarchy
    const root = d3.hierarchy<FeatureNode>(
      { id: 'root', label: 'Project', children: features },
      (d) => d.children,
    );

    const tree = d3.cluster<FeatureNode>().size([2 * Math.PI, radius]);
    tree(root);

    const g = svg
      .attr('width', width)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${cx},${cy})`);

    // Links
    g.selectAll('.link')
      .data(root.links())
      .join('path')
      .attr('class', 'link')
      .attr('fill', 'none')
      .attr('stroke', '#30363d')
      .attr('stroke-width', 1.5)
      .attr(
        'd',
        d3
          .linkRadial<
            d3.HierarchyPointLink<FeatureNode>,
            d3.HierarchyPointNode<FeatureNode>
          >()
          .angle((d) => (d as unknown as { x: number }).x)
          .radius((d) => (d as unknown as { y: number }).y),
      );

    // Nodes
    const node = g
      .selectAll('.node')
      .data(root.descendants())
      .join('g')
      .attr('class', 'node')
      .attr('transform', (d) => {
        const n = d as unknown as { x: number; y: number };
        return `rotate(${(n.x * 180) / Math.PI - 90}) translate(${n.y},0)`;
      })
      .style('cursor', 'pointer');

    node
      .append('circle')
      .attr('r', (d) => (d.depth === 0 ? 6 : d.depth === 1 ? 5 : 4))
      .attr('fill', (d) =>
        d.depth === 0 ? '#7c3aed' : d.depth === 1 ? '#a78bfa' : '#6e7681',
      )
      .attr('stroke', '#0d1117')
      .attr('stroke-width', 2);

    node
      .append('text')
      .attr('dy', '0.31em')
      .attr('x', (d) => {
        const n = d as unknown as { x: number; y: number };
        return n.x < Math.PI !== !d.children ? -8 : 8;
      })
      .attr('text-anchor', (d) => {
        const n = d as unknown as { x: number };
        return n.x < Math.PI !== !d.children ? 'end' : 'start';
      })
      .attr('transform', (d) => {
        const n = d as unknown as { x: number };
        return n.x >= Math.PI ? 'rotate(180)' : null;
      })
      .attr('font-size', (d) => (d.depth === 0 ? 12 : 10))
      .attr('fill', (d) => (d.depth === 0 ? '#e6edf3' : d.depth === 1 ? '#c9d1d9' : '#7d8590'))
      .text((d) => d.data.label);
  }, [features]);

  return <svg ref={ref} className="w-full h-full" />;
}
