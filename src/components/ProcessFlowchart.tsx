import { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  GripVertical,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-react';
import type { FlowchartNodeType, ProcessFlowNode, ProcessStepItem } from '../types/audit';
import {
  FLOWCHART_SYMBOLS,
  FLOWCHART_SYMBOL_MAP,
  buildFlowchartFromSteps,
  formatDecisionBranches,
  inferFlowchartNodeType,
  parseDecisionBranches,
} from '../utils/flowchartSvg';
import { generateProcessFlowchartAi } from '../services/aiService';
import { sanitizeFlowchartNodes } from '../utils/validation';

interface ProcessFlowchartProps {
  nodes: ProcessFlowNode[];
  editing: boolean;
  onChange: (nextNodes: ProcessFlowNode[]) => void;
  processSteps?: ProcessStepItem[];
  processName?: string;
  domain?: string;
  processFlowNarrative?: string;
}

function wrapLines(text: string, maxChars: number, maxLines: number): string[] {
  const words = (text || '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if (!current) {
      current = word.length > maxChars ? word.slice(0, maxChars - 1) + '…' : word;
    } else if (current.length + 1 + word.length <= maxChars) {
      current += ' ' + word;
    } else {
      lines.push(current);
      current = word.length > maxChars ? word.slice(0, maxChars - 1) + '…' : word;
      if (lines.length === maxLines - 1) break;
    }
  }
  if (lines.length < maxLines && current) {
    lines.push(current);
  }
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length + 2) {
    const last = lines[maxLines - 1];
    lines[maxLines - 1] = last.length >= maxChars ? last.slice(0, maxChars - 1) + '…' : `${last}…`;
  }
  return lines;
}

export function ProcessFlowchart({
  nodes,
  editing,
  onChange,
  processSteps = [],
  processName = 'Business Process',
  domain = 'Philippine Corporate',
  processFlowNarrative = '',
}: ProcessFlowchartProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [flowNotice, setFlowNotice] = useState('');

  const handleAddNode = () => {
    const idx = nodes.length + 1;
    const next: ProcessFlowNode = {
      id: `node_${Date.now().toString(36)}_${idx}`,
      stepNo: String(idx),
      label: nodes.length === 0 ? `Initiate ${processName}` : `Process Step ${idx}`,
      actorRole: 'Process Owner',
      nodeType: nodes.length === 0 ? 'start' : 'process',
      branchNote: '',
    };
    onChange([...nodes, next]);
  };

  const handleUpdateNode = (id: string, patch: Partial<ProcessFlowNode>) => {
    onChange(nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  };

  const handleRemoveNode = (id: string) => {
    const remaining = nodes.filter((n) => n.id !== id).map((n, i) => ({
      ...n,
      stepNo: String(i + 1),
    }));
    onChange(remaining);
  };

  const reorderNodes = (fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx || fromIdx < 0 || toIdx < 0 || fromIdx >= nodes.length || toIdx >= nodes.length) {
      return;
    }
    const copy = [...nodes];
    const [moved] = copy.splice(fromIdx, 1);
    copy.splice(toIdx, 0, moved);
    const renumbered = copy.map((n, idx) => ({ ...n, stepNo: String(idx + 1) }));
    onChange(renumbered);
  };

  const handleAutoBuildFromSteps = () => {
    setFlowNotice('');
    const autoNodes = buildFlowchartFromSteps(processSteps, processName);
    onChange(autoNodes);
    setFlowNotice(
      `Generated ${autoNodes.length} BPMN flowchart symbols directly from Process Steps.`
    );
  };

  const handleAutoClassifyExisting = () => {
    setFlowNotice('');
    const reclassified = nodes.map((n) => {
      const nextType = inferFlowchartNodeType(n.label, n.branchNote);
      const nextNote =
        nextType === 'decision' && !/yes\s*:/i.test(n.branchNote)
          ? formatDecisionBranches('Proceed', n.branchNote || 'Return / Escalate')
          : n.branchNote;
      return {
        ...n,
        nodeType: nextType,
        branchNote: nextNote,
      };
    });
    onChange(reclassified);
    setFlowNotice('Auto-classified all flowchart nodes into BPMN symbols.');
  };

  const handleAiGenerateFlow = async () => {
    setAiLoading(true);
    setFlowNotice('');
    try {
      const res = await generateProcessFlowchartAi({
        processName,
        domain,
        processFlowNarrative,
        processSteps,
      });
      const cleaned = sanitizeFlowchartNodes(res.flowchartNodes).map((n, i) => ({
        ...n,
        stepNo: String(i + 1),
        nodeType: n.nodeType || inferFlowchartNodeType(n.label, n.branchNote),
      }));
      if (cleaned.length > 0) {
        onChange(cleaned);
        setFlowNotice(`AI generated ${cleaned.length} BPMN flowchart symbols with decision branches.`);
      } else {
        const fallback = buildFlowchartFromSteps(processSteps, processName);
        onChange(fallback);
        setFlowNotice('Generated flowchart from Process Steps.');
      }
    } catch {
      const fallback = buildFlowchartFromSteps(processSteps, processName);
      onChange(fallback);
      setFlowNotice('Auto-generated BPMN symbols from Process Steps using built-in Auto Flow rules.');
    } finally {
      setAiLoading(false);
    }
  };

  // Interactive SVG Diagram geometry (matches generateProcessFlowchartSvg in src/utils/flowchartSvg.ts)
  const cols = 3;
  const nodeW = 246;
  const nodeH = 104;
  const gapX = 90;
  const gapY = 84;
  const padX = 34;
  const padY = 28;
  const legendH = 68;

  const effectiveCount = Math.max(nodes.length, 1);
  const usedCols = Math.min(effectiveCount, cols);
  const rows = Math.max(1, Math.ceil(nodes.length / cols));
  const svgWidth = Math.max(760, padX * 2 + usedCols * nodeW + Math.max(0, usedCols - 1) * gapX);
  const diagramHeight = padY * 2 + rows * nodeH + Math.max(0, rows - 1) * gapY;
  const svgHeight = diagramHeight + legendH;

  const getCoords = (index: number) => {
    const row = Math.floor(index / cols);
    const colInRow = index % cols;
    const col = row % 2 === 0 ? colInRow : cols - 1 - colInRow;
    const x = padX + col * (nodeW + gapX);
    const y = padY + row * (nodeH + gapY);
    return { x, y, row, col };
  };

  const legendCellW = (svgWidth - padX * 2) / 5;

  return (
    <div className="space-y-4">
      {/* Visual BPMN / ISO Flowchart Canvas */}
      {nodes.length === 0 ? (
        <div className="border border-dashed border-slate-300 rounded-lg p-6 text-center bg-slate-50/70 space-y-2">
          <p className="text-xs text-slate-600">
            No BPMN flowchart nodes defined yet.
            {editing ? ' Add a node or click "Auto-Flow from Steps" below to draw the diagram.' : ''}
          </p>
        </div>
      ) : (
        <div className="border border-slate-200 rounded-lg bg-slate-50/60 p-3 overflow-x-auto">
          <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            className="w-full min-w-[740px] h-auto block"
            role="img"
            aria-label="BPMN Process Flowchart Diagram"
          >
            <defs>
              <marker
                id="proc-arrow"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 10 5 L 0 9 z" fill="#475569" />
              </marker>
              <marker
                id="proc-arrow-yes"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 10 5 L 0 9 z" fill="#059669" />
              </marker>
              <marker
                id="proc-arrow-no"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 10 5 L 0 9 z" fill="#dc2626" />
              </marker>
            </defs>

            {/* Connectors + Decision Yes labels */}
            {nodes.map((node, idx) => {
              if (idx >= nodes.length - 1) return null;
              const from = getCoords(idx);
              const to = getCoords(idx + 1);
              const isDecision = node.nodeType === 'decision';
              const strokeColor = isDecision ? '#059669' : '#475569';

              let pathD = '';
              let labelX = 0;
              let labelY = 0;

              if (from.row === to.row) {
                const goingRight = to.x > from.x;
                const startX = goingRight ? from.x + nodeW : from.x;
                const endX = goingRight ? to.x - 5 : to.x + nodeW + 5;
                const midY = from.y + nodeH / 2;
                pathD = `M ${startX} ${midY} L ${endX} ${midY}`;
                labelX = (startX + endX) / 2;
                labelY = midY - 12;
              } else {
                const startX = from.x + nodeW / 2;
                const startY = from.y + nodeH;
                const endX = to.x + nodeW / 2;
                const endY = to.y - 5;
                const midY = startY + (gapY - 18) * 0.58;
                pathD = `M ${startX} ${startY} L ${startX} ${midY} L ${endX} ${midY} L ${endX} ${endY}`;
                labelX = startX + 32;
                labelY = startY + 20;
              }

              const { yesLabel } = parseDecisionBranches(node.branchNote);
              const shortYes = yesLabel.length > 14 ? `${yesLabel.slice(0, 12)}…` : yesLabel;
              const pillW = Math.max(36, shortYes.length * 6.5 + 14);

              return (
                <g key={`edge_${node.id}`}>
                  <path
                    d={pathD}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth="2"
                    markerEnd={`url(#${isDecision ? 'proc-arrow-yes' : 'proc-arrow'})`}
                  />
                  {isDecision && (
                    <g transform={`translate(${labelX - pillW / 2}, ${labelY - 10})`}>
                      <rect
                        width={pillW}
                        height={18}
                        rx={9}
                        fill="#ecfdf5"
                        stroke="#059669"
                        strokeWidth={1.2}
                      />
                      <text
                        x={pillW / 2}
                        y={12.5}
                        textAnchor="middle"
                        fontSize="9.5"
                        fontWeight="700"
                        fill="#065f46"
                        fontFamily="Arial, Helvetica, sans-serif"
                      >
                        {shortYes}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}

            {/* Decision Diamond Explicit NO Branch Paths */}
            {nodes.map((node, idx) => {
              if (node.nodeType !== 'decision') return null;
              const { x, y, row } = getCoords(idx);
              const nextSameRow = idx < nodes.length - 1 && getCoords(idx + 1).row === row;
              const { noLabel } = parseDecisionBranches(node.branchNote);
              const shortNo = noLabel.length > 22 ? `${noLabel.slice(0, 20)}…` : noLabel;

              if (nextSameRow) {
                const bx = x + nodeW / 2;
                const by1 = y + nodeH;
                const by2 = by1 + 26;
                const pillW = Math.min(200, Math.max(76, shortNo.length * 6.2 + 18));
                return (
                  <g key={`no_${node.id}`}>
                    <path
                      d={`M ${bx} ${by1} L ${bx} ${by2}`}
                      fill="none"
                      stroke="#dc2626"
                      strokeWidth="1.75"
                      strokeDasharray="4 3"
                      markerEnd="url(#proc-arrow-no)"
                    />
                    <g transform={`translate(${bx - pillW / 2}, ${by2 + 3})`}>
                      <rect
                        width={pillW}
                        height={20}
                        rx={4}
                        fill="#fef2f2"
                        stroke="#dc2626"
                        strokeWidth={1.2}
                      />
                      <text
                        x={pillW / 2}
                        y={13.5}
                        textAnchor="middle"
                        fontSize="9.5"
                        fontWeight="700"
                        fill="#991b1b"
                        fontFamily="Arial, Helvetica, sans-serif"
                      >
                        NO: {shortNo}
                      </text>
                    </g>
                  </g>
                );
              }

              const goingLeft = row % 2 === 1;
              const startX = goingLeft ? x + nodeW : x;
              const dir = goingLeft ? 1 : -1;
              const endX = startX + dir * 24;
              const midY = y + nodeH / 2;
              const pillW = Math.min(130, Math.max(66, shortNo.length * 6 + 14));
              const boxX = goingLeft ? endX + 4 : Math.max(4, endX - pillW - 4);
              return (
                <g key={`no_${node.id}`}>
                  <path
                    d={`M ${startX} ${midY} L ${endX} ${midY}`}
                    fill="none"
                    stroke="#dc2626"
                    strokeWidth="1.75"
                    strokeDasharray="4 3"
                    markerEnd="url(#proc-arrow-no)"
                  />
                  <g transform={`translate(${boxX}, ${midY - 10})`}>
                    <rect
                      width={pillW}
                      height={20}
                      rx={4}
                      fill="#fef2f2"
                      stroke="#dc2626"
                      strokeWidth={1.2}
                    />
                    <text
                      x={pillW / 2}
                      y={13.5}
                      textAnchor="middle"
                      fontSize="9"
                      fontWeight="700"
                      fill="#991b1b"
                      fontFamily="Arial, Helvetica, sans-serif"
                    >
                      NO: {shortNo.slice(0, 15)}
                    </text>
                  </g>
                </g>
              );
            })}

            {/* Flowchart Nodes with Proper BPMN / ISO Shapes */}
            {nodes.map((node, idx) => {
              const { x, y } = getCoords(idx);
              const meta = FLOWCHART_SYMBOL_MAP[node.nodeType] || FLOWCHART_SYMBOL_MAP.process;
              const isDecision = node.nodeType === 'decision';
              const isStartOrEnd = node.nodeType === 'start' || node.nodeType === 'end';
              const isDatabase = node.nodeType === 'database';
              const isManual = node.nodeType === 'manual';
              const isSystem = node.nodeType === 'system';

              const cx = x + nodeW / 2;
              const cy = y + nodeH / 2;

              const maxLabelChars = isDecision ? 20 : isStartOrEnd || isManual ? 24 : isSystem ? 25 : 28;
              const labelLines = wrapLines(node.label, maxLabelChars, 2);

              const headerY = isDecision ? y + 23 : isDatabase ? y + 32 : y + 20;
              const titleY1 = isDecision ? y + 44 : isDatabase ? y + 50 : y + 42;
              const titleY2 = titleY1 + 15;
              const footerY = isDecision
                ? y + 79
                : node.nodeType === 'document'
                  ? y + nodeH - 22
                  : y + nodeH - 14;

              const actorLine = isDecision
                ? `${node.actorRole}`.slice(0, 22)
                : `${node.actorRole}${node.branchNote ? ` · ${node.branchNote}` : ''}`.slice(
                    isManual || isStartOrEnd ? 26 : 33
                  );

              return (
                <g key={node.id}>
                  {node.nodeType === 'start' && (
                    <rect
                      x={x}
                      y={y}
                      width={nodeW}
                      height={nodeH}
                      rx={nodeH / 2}
                      ry={nodeH / 2}
                      fill={meta.fill}
                      stroke={meta.stroke}
                      strokeWidth={2.2}
                    />
                  )}
                  {node.nodeType === 'end' && (
                    <>
                      <rect
                        x={x}
                        y={y}
                        width={nodeW}
                        height={nodeH}
                        rx={nodeH / 2}
                        ry={nodeH / 2}
                        fill={meta.fill}
                        stroke={meta.stroke}
                        strokeWidth={3}
                      />
                      <rect
                        x={x + 5}
                        y={y + 5}
                        width={nodeW - 10}
                        height={nodeH - 10}
                        rx={(nodeH - 10) / 2}
                        ry={(nodeH - 10) / 2}
                        fill="none"
                        stroke="#475569"
                        strokeWidth={1}
                      />
                    </>
                  )}
                  {node.nodeType === 'decision' && (
                    <polygon
                      points={`${cx},${y} ${x + nodeW},${cy} ${cx},${y + nodeH} ${x},${cy}`}
                      fill={meta.fill}
                      stroke={meta.stroke}
                      strokeWidth={2.2}
                      strokeLinejoin="round"
                    />
                  )}
                  {node.nodeType === 'document' && (
                    <path
                      d={`M ${x} ${y + 6} Q ${x} ${y} ${x + 6} ${y} H ${x + nodeW - 6} Q ${x + nodeW} ${y} ${x + nodeW} ${y + 6} V ${y + nodeH - 10} Q ${x + nodeW * 0.75} ${y + nodeH - 24} ${x + nodeW * 0.5} ${y + nodeH - 10} T ${x} ${y + nodeH - 10} Z`}
                      fill={meta.fill}
                      stroke={meta.stroke}
                      strokeWidth={2}
                    />
                  )}
                  {node.nodeType === 'system' && (
                    <>
                      <rect
                        x={x}
                        y={y}
                        width={nodeW}
                        height={nodeH}
                        rx={8}
                        fill={meta.fill}
                        stroke={meta.stroke}
                        strokeWidth={2}
                      />
                      <line
                        x1={x + 12}
                        y1={y}
                        x2={x + 12}
                        y2={y + nodeH}
                        stroke={meta.stroke}
                        strokeWidth={1.6}
                      />
                      <line
                        x1={x + nodeW - 12}
                        y1={y}
                        x2={x + nodeW - 12}
                        y2={y + nodeH}
                        stroke={meta.stroke}
                        strokeWidth={1.6}
                      />
                    </>
                  )}
                  {node.nodeType === 'database' && (
                    <>
                      <path
                        d={`M ${x} ${y + 11} V ${y + nodeH - 11} A ${nodeW / 2} 11 0 0 0 ${x + nodeW} ${y + nodeH - 11} V ${y + 11} Z`}
                        fill={meta.fill}
                        stroke={meta.stroke}
                        strokeWidth={2}
                      />
                      <ellipse
                        cx={cx}
                        cy={y + 11}
                        rx={nodeW / 2}
                        ry={11}
                        fill="#ede9fe"
                        stroke={meta.stroke}
                        strokeWidth={2}
                      />
                    </>
                  )}
                  {node.nodeType === 'control' && (
                    <>
                      <polygon
                        points={`${x + 16},${y} ${x + nodeW - 16},${y} ${x + nodeW},${y + 16} ${x + nodeW},${y + nodeH - 16} ${x + nodeW - 16},${y + nodeH} ${x + 16},${y + nodeH} ${x},${y + nodeH - 16} ${x},${y + 16}`}
                        fill={meta.fill}
                        stroke={meta.stroke}
                        strokeWidth={2.4}
                        strokeLinejoin="round"
                      />
                      <polygon
                        points={`${x + 19},${y + 4} ${x + nodeW - 19},${y + 4} ${x + nodeW - 4},${y + 19} ${x + nodeW - 4},${y + nodeH - 19} ${x + nodeW - 19},${y + nodeH - 4} ${x + 19},${y + nodeH - 4} ${x + 4},${y + nodeH - 19} ${x + 4},${y + 19}`}
                        fill="none"
                        stroke="#93c5fd"
                        strokeWidth={1.2}
                      />
                    </>
                  )}
                  {node.nodeType === 'manual' && (
                    <polygon
                      points={`${x},${y} ${x + nodeW},${y} ${x + nodeW - 20},${y + nodeH} ${x + 20},${y + nodeH}`}
                      fill={meta.fill}
                      stroke={meta.stroke}
                      strokeWidth={2}
                      strokeLinejoin="round"
                    />
                  )}
                  {node.nodeType === 'process' && (
                    <rect
                      x={x}
                      y={y}
                      width={nodeW}
                      height={nodeH}
                      rx={4}
                      fill={meta.fill}
                      stroke={meta.stroke}
                      strokeWidth={1.8}
                    />
                  )}

                  <text
                    x={cx}
                    y={headerY}
                    textAnchor="middle"
                    fontSize="9.5"
                    fontWeight="700"
                    fill={meta.textFill}
                    fontFamily="Arial, Helvetica, sans-serif"
                  >
                    {`${node.stepNo} · ${meta.badgeText}`}
                  </text>
                  <text
                    x={cx}
                    y={titleY1}
                    textAnchor="middle"
                    fontSize="11.5"
                    fontWeight="700"
                    fill="#0f172a"
                    fontFamily="Arial, Helvetica, sans-serif"
                  >
                    {labelLines[0] || ''}
                  </text>
                  {labelLines[1] && (
                    <text
                      x={cx}
                      y={titleY2}
                      textAnchor="middle"
                      fontSize="11.5"
                      fontWeight="700"
                      fill="#0f172a"
                      fontFamily="Arial, Helvetica, sans-serif"
                    >
                      {labelLines[1]}
                    </text>
                  )}
                  <text
                    x={cx}
                    y={footerY}
                    textAnchor="middle"
                    fontSize="9.5"
                    fill="#64748b"
                    fontFamily="Arial, Helvetica, sans-serif"
                  >
                    {actorLine}
                  </text>
                </g>
              );
            })}

            {/* Built-in BPMN / ISO Symbol Legend */}
            <line
              x1={padX}
              y1={diagramHeight}
              x2={svgWidth - padX}
              y2={diagramHeight}
              stroke="#cbd5e1"
              strokeWidth={1}
            />
            {FLOWCHART_SYMBOLS.map((sym, i) => {
              const row = Math.floor(i / 5);
              const col = i % 5;
              const lx = padX + col * legendCellW;
              const ly = diagramHeight + 8 + row * 24;
              return (
                <g key={sym.type}>
                  {(sym.type === 'start' || sym.type === 'end') && (
                    <rect
                      x={lx}
                      y={ly + 3}
                      width={18}
                      height={12}
                      rx={6}
                      fill={sym.fill}
                      stroke={sym.stroke}
                      strokeWidth={sym.type === 'end' ? 2 : 1.4}
                    />
                  )}
                  {sym.type === 'process' && (
                    <rect
                      x={lx}
                      y={ly + 3}
                      width={18}
                      height={12}
                      rx={2}
                      fill={sym.fill}
                      stroke={sym.stroke}
                      strokeWidth={1.4}
                    />
                  )}
                  {sym.type === 'decision' && (
                    <polygon
                      points={`${lx + 9},${ly + 1} ${lx + 18},${ly + 9} ${lx + 9},${ly + 17} ${lx},${ly + 9}`}
                      fill={sym.fill}
                      stroke={sym.stroke}
                      strokeWidth={1.4}
                    />
                  )}
                  {sym.type === 'document' && (
                    <path
                      d={`M ${lx} ${ly + 3} H ${lx + 18} V ${ly + 13} Q ${lx + 13} ${ly + 10} ${lx + 9} ${ly + 13} T ${lx} ${ly + 13} Z`}
                      fill={sym.fill}
                      stroke={sym.stroke}
                      strokeWidth={1.4}
                    />
                  )}
                  {sym.type === 'system' && (
                    <>
                      <rect
                        x={lx}
                        y={ly + 3}
                        width={18}
                        height={12}
                        rx={2}
                        fill={sym.fill}
                        stroke={sym.stroke}
                        strokeWidth={1.4}
                      />
                      <line
                        x1={lx + 4}
                        y1={ly + 3}
                        x2={lx + 4}
                        y2={ly + 15}
                        stroke={sym.stroke}
                        strokeWidth={1.2}
                      />
                      <line
                        x1={lx + 14}
                        y1={ly + 3}
                        x2={lx + 14}
                        y2={ly + 15}
                        stroke={sym.stroke}
                        strokeWidth={1.2}
                      />
                    </>
                  )}
                  {sym.type === 'database' && (
                    <>
                      <path
                        d={`M ${lx + 1} ${ly + 6} V ${ly + 14} A 8 3 0 0 0 ${lx + 17} ${ly + 14} V ${ly + 6} Z`}
                        fill={sym.fill}
                        stroke={sym.stroke}
                        strokeWidth={1.3}
                      />
                      <ellipse
                        cx={lx + 9}
                        cy={ly + 6}
                        rx={8}
                        ry={3}
                        fill="#ede9fe"
                        stroke={sym.stroke}
                        strokeWidth={1.3}
                      />
                    </>
                  )}
                  {sym.type === 'control' && (
                    <polygon
                      points={`${lx + 4},${ly + 3} ${lx + 14},${ly + 3} ${lx + 18},${ly + 7} ${lx + 18},${ly + 11} ${lx + 14},${ly + 15} ${lx + 4},${ly + 15} ${lx},${ly + 11} ${lx},${ly + 7}`}
                      fill={sym.fill}
                      stroke={sym.stroke}
                      strokeWidth={1.5}
                    />
                  )}
                  {sym.type === 'manual' && (
                    <polygon
                      points={`${lx},${ly + 3} ${lx + 18},${ly + 3} ${lx + 15},${ly + 15} ${lx + 3},${ly + 15}`}
                      fill={sym.fill}
                      stroke={sym.stroke}
                      strokeWidth={1.4}
                    />
                  )}
                  <text
                    x={lx + 24}
                    y={ly + 12.5}
                    fontSize="10"
                    fontWeight="600"
                    fill="#334155"
                    fontFamily="Arial, Helvetica, sans-serif"
                  >
                    {`${sym.label} (${sym.shapeName})`}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      )}

      {/* Interactive Flowchart Builder (Add, Edit, Delete, Symbol Picker, Auto Flow, Drag & Reorder) */}
      {editing && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium text-slate-700">
              Interactive Flowchart Nodes ({nodes.length}) — Drag rows to reorder; diagram updates automatically
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleAutoBuildFromSteps}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
                title="Rebuild flowchart automatically from Section 05 Process Steps"
              >
                <Wand2 className="w-3.5 h-3.5 text-blue-900" />
                Auto-Flow from Steps
              </button>
              <button
                type="button"
                onClick={handleAutoClassifyExisting}
                disabled={nodes.length === 0}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-50"
                title="Automatically assign BPMN symbols based on each step label"
              >
                Auto-Classify Symbols
              </button>
              <button
                type="button"
                onClick={handleAiGenerateFlow}
                disabled={aiLoading}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-blue-900 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 disabled:opacity-50"
              >
                {aiLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                {aiLoading ? 'Generating Flow...' : 'AI Auto-Generate Flow'}
              </button>
              <button
                type="button"
                onClick={handleAddNode}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-900 rounded-md hover:bg-blue-800"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Step
              </button>
            </div>
          </div>

          {flowNotice && (
            <p className="text-xs text-blue-900 bg-blue-50 border border-blue-200 rounded px-3 py-1.5">
              {flowNotice}
            </p>
          )}

          <div className="space-y-2">
            {nodes.map((node, idx) => {
              const style = FLOWCHART_SYMBOL_MAP[node.nodeType] || FLOWCHART_SYMBOL_MAP.process;
              const isDecision = node.nodeType === 'decision';
              const branches = parseDecisionBranches(node.branchNote);
              const isDragTarget = dragOverIndex === idx && dragIndex !== idx;

              return (
                <div
                  key={node.id}
                  draggable
                  onDragStart={(e) => {
                    setDragIndex(idx);
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', String(idx));
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    if (dragOverIndex !== idx) setDragOverIndex(idx);
                  }}
                  onDragLeave={() => {
                    if (dragOverIndex === idx) setDragOverIndex(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const sourceIdx = dragIndex ?? Number(e.dataTransfer.getData('text/plain'));
                    if (Number.isInteger(sourceIdx)) {
                      reorderNodes(sourceIdx, idx);
                    }
                    setDragIndex(null);
                    setDragOverIndex(null);
                  }}
                  onDragEnd={() => {
                    setDragIndex(null);
                    setDragOverIndex(null);
                  }}
                  className={`p-3 rounded-md border ${style.cardBorder} ${style.cardBg} ${
                    isDragTarget ? 'ring-2 ring-blue-900' : ''
                  } ${dragIndex === idx ? 'opacity-60' : ''} transition-all`}
                >
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
                    <div className="md:col-span-1 flex items-center gap-1">
                      <span
                        className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-700"
                        title="Drag to reorder"
                      >
                        <GripVertical className="w-4 h-4" />
                      </span>
                      <input
                        type="text"
                        value={node.stepNo}
                        onChange={(e) => handleUpdateNode(node.id, { stepNo: e.target.value })}
                        placeholder="#"
                        className="w-10 px-1.5 py-1 text-xs font-mono bg-white border border-slate-200 rounded text-center"
                      />
                    </div>
                    <div className="md:col-span-3">
                      <select
                        value={node.nodeType}
                        onChange={(e) =>
                          handleUpdateNode(node.id, {
                            nodeType: e.target.value as FlowchartNodeType,
                          })
                        }
                        className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded font-medium text-slate-800"
                      >
                        {FLOWCHART_SYMBOLS.map((sym) => (
                          <option key={sym.type} value={sym.type}>
                            {sym.label} ({sym.shapeName})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="md:col-span-3">
                      <input
                        type="text"
                        value={node.label}
                        onChange={(e) => handleUpdateNode(node.id, { label: e.target.value })}
                        placeholder="Step label (e.g. Is Approval Complete?)"
                        className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <input
                        type="text"
                        value={node.actorRole}
                        onChange={(e) => handleUpdateNode(node.id, { actorRole: e.target.value })}
                        placeholder="Actor / Role"
                        className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded"
                      />
                    </div>
                    <div className="md:col-span-2">
                      {!isDecision ? (
                        <input
                          type="text"
                          value={node.branchNote}
                          onChange={(e) =>
                            handleUpdateNode(node.id, { branchNote: e.target.value })
                          }
                          placeholder="Control / System note"
                          className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded"
                        />
                      ) : (
                        <span className="text-[11px] font-medium text-amber-800">
                          Yes / No branches below
                        </span>
                      )}
                    </div>
                    <div className="md:col-span-1 flex items-center justify-end gap-0.5">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => reorderNodes(idx, idx - 1)}
                        className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 rounded"
                        title="Move up"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === nodes.length - 1}
                        onClick={() => reorderNodes(idx, idx + 1)}
                        className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 rounded"
                        title="Move down"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveNode(node.id)}
                        className="p-1 text-slate-400 hover:text-red-600 rounded"
                        title="Delete step"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {isDecision && (
                    <div className="mt-2 pt-2 border-t border-amber-200/70 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-semibold text-emerald-800 mb-0.5">
                          YES Branch Label (Proceeds Forward)
                        </label>
                        <input
                          type="text"
                          value={branches.yesLabel}
                          onChange={(e) =>
                            handleUpdateNode(node.id, {
                              branchNote: formatDecisionBranches(e.target.value, branches.noLabel),
                            })
                          }
                          placeholder="e.g. Yes: Issue PO"
                          className="w-full px-2 py-1 text-xs bg-white border border-emerald-200 rounded"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-red-800 mb-0.5">
                          NO Branch Label (Exception / Escalation)
                        </label>
                        <input
                          type="text"
                          value={branches.noLabel}
                          onChange={(e) =>
                            handleUpdateNode(node.id, {
                              branchNote: formatDecisionBranches(branches.yesLabel, e.target.value),
                            })
                          }
                          placeholder="e.g. Return to Requestor"
                          className="w-full px-2 py-1 text-xs bg-white border border-red-200 rounded"
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
