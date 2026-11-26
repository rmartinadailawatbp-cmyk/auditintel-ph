import type { FlowchartNodeType, ProcessFlowNode, ProcessStepItem } from '../types/audit';

export interface FlowchartSymbolMeta {
  type: FlowchartNodeType;
  label: string;
  shapeName: string;
  badgeText: string;
  fill: string;
  stroke: string;
  textFill: string;
  cardBorder: string;
  cardBg: string;
}

export const FLOWCHART_SYMBOLS: FlowchartSymbolMeta[] = [
  {
    type: 'start',
    label: 'Start Event',
    shapeName: 'Oval / Terminator',
    badgeText: 'START',
    fill: '#ecfdf5',
    stroke: '#059669',
    textFill: '#065f46',
    cardBorder: 'border-emerald-300',
    cardBg: 'bg-emerald-50/60',
  },
  {
    type: 'process',
    label: 'Process Step',
    shapeName: 'Rectangle',
    badgeText: 'PROCESS',
    fill: '#ffffff',
    stroke: '#475569',
    textFill: '#334155',
    cardBorder: 'border-slate-300',
    cardBg: 'bg-white',
  },
  {
    type: 'decision',
    label: 'Decision Point',
    shapeName: 'Diamond',
    badgeText: 'DECISION',
    fill: '#fffbeb',
    stroke: '#d97706',
    textFill: '#92400e',
    cardBorder: 'border-amber-300',
    cardBg: 'bg-amber-50/60',
  },
  {
    type: 'document',
    label: 'Document',
    shapeName: 'Document Shape',
    badgeText: 'DOCUMENT',
    fill: '#f0f9ff',
    stroke: '#0284c7',
    textFill: '#075985',
    cardBorder: 'border-sky-300',
    cardBg: 'bg-sky-50/60',
  },
  {
    type: 'system',
    label: 'System Activity',
    shapeName: 'Automated Process',
    badgeText: 'SYSTEM',
    fill: '#eef2ff',
    stroke: '#4338ca',
    textFill: '#312e81',
    cardBorder: 'border-indigo-300',
    cardBg: 'bg-indigo-50/60',
  },
  {
    type: 'database',
    label: 'Database',
    shapeName: 'Cylinder',
    badgeText: 'DATABASE',
    fill: '#f5f3ff',
    stroke: '#6d28d9',
    textFill: '#4c1d95',
    cardBorder: 'border-violet-300',
    cardBg: 'bg-violet-50/60',
  },
  {
    type: 'control',
    label: 'Control Point',
    shapeName: 'Control Symbol',
    badgeText: 'CONTROL',
    fill: '#eff6ff',
    stroke: '#1e3a8a',
    textFill: '#1e3a8a',
    cardBorder: 'border-blue-300',
    cardBg: 'bg-blue-50/70',
  },
  {
    type: 'manual',
    label: 'Manual Activity',
    shapeName: 'Trapezoid',
    badgeText: 'MANUAL',
    fill: '#fff7ed',
    stroke: '#ea580c',
    textFill: '#9a3412',
    cardBorder: 'border-orange-300',
    cardBg: 'bg-orange-50/60',
  },
  {
    type: 'end',
    label: 'End Event',
    shapeName: 'Oval / Terminator',
    badgeText: 'END',
    fill: '#f1f5f9',
    stroke: '#1e293b',
    textFill: '#0f172a',
    cardBorder: 'border-slate-400',
    cardBg: 'bg-slate-100/80',
  },
];

export const FLOWCHART_SYMBOL_MAP: Record<FlowchartNodeType, FlowchartSymbolMeta> =
  FLOWCHART_SYMBOLS.reduce(
    (acc, item) => {
      acc[item.type] = item;
      return acc;
    },
    {} as Record<FlowchartNodeType, FlowchartSymbolMeta>
  );

/**
 * Deterministic Auto Flow classifier: analyzes a step title/description and assigns
 * the exact BPMN / ISO 5807 flowchart symbol type.
 */
export function inferFlowchartNodeType(label: string, hint = ''): FlowchartNodeType {
  const cleanLabel = (label || '').trim();
  const lower = cleanLabel.toLowerCase();
  const combined = `${cleanLabel} ${hint}`.toLowerCase();

  // 1. Decision Point (questions, approval gates, threshold comparisons)
  if (
    cleanLabel.endsWith('?') ||
    /^(is|are|does|do|has|have|was|were|can|should|will|did)\b/.test(lower) ||
    /\b(if |whether|decision|threshold|variance\s*[><=]|amount\s*[><=]|approved\?|complete\?|valid\?|match\?)\b/.test(
      lower
    )
  ) {
    return 'decision';
  }

  // 2. Start / End Events
  if (/\b(start|initiate|trigger|begin|commence|opening)\b/.test(lower)) {
    return 'start';
  }
  if (/\b(end|terminate|finish|complete process|final close|closeout)\b/.test(lower)) {
    return 'end';
  }

  // 3. Database (Cylinder)
  if (
    /\b(database|db\b|sql|data warehouse|data store|master\s*file|repository|save to db|store in db|save to database|write to database|persist to)\b/.test(
      lower
    )
  ) {
    return 'database';
  }

  // 4. Document (Wavy bottom document shape) - specifically generating/producing/issuing documents
  if (
    /\b(generate|issue|print|prepare|draft|produce|compile|create)\b.*\b(invoice|voucher|receipt|report|form|slip|memo|letter|certificate|bir|2307|po\b|pr\b|rr\b|z-reading|document|apv)\b/.test(
      lower
    ) ||
    /^(invoice|bir form|form 2307|payment voucher|receiving report|z-reading|sales invoice)\b/.test(lower)
  ) {
    return 'document';
  }

  // 5. System Activity (Automated / ERP / API / Portal posting)
  if (
    /\b(post to erp|post in erp|erp|sap|netsuite|pos\b|portal|automated|auto-|system\b|electronic|eft\b|instapay|pesonet|api\b|transmit|sync to|upload to|batch run)\b/.test(
      lower
    )
  ) {
    return 'system';
  }

  // 6. Control Point (3-way match, dual custody, reconciliation, control verification)
  if (
    /\b(control|3-way match|three-way match|dual custody|dual sign|dual review|maker-checker|reconcil|segregation of duties|sod\b|exception check|supervisor approval|tolerance block)\b/.test(
      lower
    )
  ) {
    return 'control';
  }

  // 7. Manual Activity (Trapezoid)
  if (
    /\b(manual|physical count|blind cash count|hand-sign|wet signature|logbook|paper|inspect physically|manual review)\b/.test(
      lower
    )
  ) {
    return 'manual';
  }

  // Secondary check against hint if label was generic
  if (/\b(automated|erp)\b/.test(combined) && !/\bverify supporting documents\b/.test(lower)) {
    return 'system';
  }

  // 8. Default Process Step (Rectangle)
  return 'process';
}

export function parseDecisionBranches(branchNote: string): { yesLabel: string; noLabel: string } {
  const raw = (branchNote || '').trim();
  if (!raw) {
    return { yesLabel: 'Yes', noLabel: 'No (Escalate / Return)' };
  }

  const pipeMatch = raw.match(/yes\s*:\s*([^|]+)\|\s*no\s*:\s*(.+)/i);
  if (pipeMatch) {
    return {
      yesLabel: pipeMatch[1].trim() || 'Yes',
      noLabel: pipeMatch[2].trim() || 'No',
    };
  }

  const slashMatch = raw.match(/^([^/]+)\/([^/]+)$/);
  if (slashMatch) {
    return {
      yesLabel: slashMatch[1].trim() || 'Yes',
      noLabel: slashMatch[2].trim() || 'No',
    };
  }

  return {
    yesLabel: 'Yes',
    noLabel: raw,
  };
}

export function formatDecisionBranches(yesLabel: string, noLabel: string): string {
  const y = (yesLabel || 'Yes').trim().slice(0, 60);
  const n = (noLabel || 'No (Escalate)').trim().slice(0, 80);
  return `Yes: ${y} | No: ${n}`.slice(0, 160);
}

/**
 * Auto-generates a full BPMN / Flowchart sequence from structured Process Steps,
 * automatically choosing symbols (Start, Process, Decision, Document, System, Database, Control, Manual, End).
 */
export function buildFlowchartFromSteps(
  steps: ProcessStepItem[],
  processTitle = 'Process'
): ProcessFlowNode[] {
  if (!steps || steps.length === 0) {
    return [
      {
        id: 'node_auto_1',
        stepNo: '1',
        label: `Initiate ${processTitle}`,
        actorRole: 'Process Initiator',
        nodeType: 'start',
        branchNote: 'Trigger Event',
      },
      {
        id: 'node_auto_2',
        stepNo: '2',
        label: 'Verify Supporting Documents',
        actorRole: 'Operations Staff',
        nodeType: 'process',
        branchNote: 'Completeness Check',
      },
      {
        id: 'node_auto_3',
        stepNo: '3',
        label: 'Is Approval Complete?',
        actorRole: 'Department Approver',
        nodeType: 'decision',
        branchNote: 'Yes: Proceed | No: Return for Correction',
      },
      {
        id: 'node_auto_4',
        stepNo: '4',
        label: 'Post to ERP & Save to Database',
        actorRole: 'Finance / ERP',
        nodeType: 'system',
        branchNote: 'Automated GL Entry',
      },
      {
        id: 'node_auto_5',
        stepNo: '5',
        label: 'Archive Audit Trail',
        actorRole: 'Process Owner',
        nodeType: 'end',
        branchNote: 'Completed',
      },
    ];
  }

  const generated: ProcessFlowNode[] = steps.slice(0, 26).map((step, idx) => {
    const inferred = inferFlowchartNodeType(step.stepTitle, `${step.description} ${step.systemUsed}`);
    let nodeType = inferred;
    if (idx === 0 && (inferred === 'process' || inferred === 'manual')) {
      nodeType = 'start';
    } else if (idx === steps.length - 1 && inferred === 'process') {
      nodeType = 'end';
    }

    let branchNote = step.slaOrFrequency || step.outputDoc || '';
    if (nodeType === 'decision') {
      branchNote = formatDecisionBranches('Proceed Next', step.outputDoc ? `Hold (${step.outputDoc})` : 'Return / Escalate');
    }

    return {
      id: `node_auto_${idx + 1}_${Date.now().toString(36).slice(-4)}`,
      stepNo: step.stepNo || String(idx + 1),
      label: step.stepTitle || `Step ${idx + 1}`,
      actorRole: step.actorRole || 'Process Owner',
      nodeType,
      branchNote: branchNote.slice(0, 160),
    };
  });

  // Guarantee explicit Start / End framing if missing
  if (generated[0] && generated[0].nodeType !== 'start') {
    generated.unshift({
      id: `node_auto_start_${Date.now().toString(36).slice(-4)}`,
      stepNo: '0',
      label: `Start: ${processTitle}`.slice(0, 90),
      actorRole: generated[0].actorRole || 'Initiator',
      nodeType: 'start',
      branchNote: 'Process Trigger',
    });
  }
  const last = generated[generated.length - 1];
  if (last && last.nodeType !== 'end' && generated.length < 28) {
    generated.push({
      id: `node_auto_end_${Date.now().toString(36).slice(-4)}`,
      stepNo: String(generated.length + 1),
      label: 'Process Complete & Retained',
      actorRole: last.actorRole || 'Process Owner',
      nodeType: 'end',
      branchNote: 'Audit Trail Archived',
    });
  }

  return generated.map((n, i) => ({ ...n, stepNo: String(i + 1) }));
}

function escapeXml(text: string): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
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

export interface FlowchartSvgRenderResult {
  svgMarkup: string;
  width: number;
  height: number;
}

/**
 * Generates a pure, self-contained BPMN / ISO-style SVG diagram string (no external fonts or CSS classes)
 * suitable for both inline React rendering and high-DPI Canvas -> PNG conversion for PDF & DOCX exports.
 */
export function generateProcessFlowchartSvg(nodes: ProcessFlowNode[]): FlowchartSvgRenderResult {
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

  const edgesSvg: string[] = [];
  const decisionBranchesSvg: string[] = [];
  const nodesSvg: string[] = [];

  // 1. Sequence Connectors + Yes labels for Decisions
  nodes.forEach((node, idx) => {
    if (idx < nodes.length - 1) {
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

      edgesSvg.push(
        `<path d="${pathD}" fill="none" stroke="${strokeColor}" stroke-width="2" marker-end="url(#${isDecision ? 'proc-arrow-yes' : 'proc-arrow'})" />`
      );

      if (isDecision) {
        const { yesLabel } = parseDecisionBranches(node.branchNote);
        const shortYes = yesLabel.length > 14 ? `${yesLabel.slice(0, 12)}…` : yesLabel;
        const pillW = Math.max(36, shortYes.length * 6.5 + 14);
        edgesSvg.push(
          `<g transform="translate(${labelX - pillW / 2}, ${labelY - 10})">
            <rect width="${pillW}" height="18" rx="9" fill="#ecfdf5" stroke="#059669" stroke-width="1.2" />
            <text x="${pillW / 2}" y="12.5" text-anchor="middle" font-size="9.5" font-weight="700" fill="#065f46" font-family="Arial, Helvetica, sans-serif">${escapeXml(shortYes)}</text>
          </g>`
        );
      }
    }

    // Explicit NO exception branch on decision diamond
    if (node.nodeType === 'decision') {
      const { x, y, row } = getCoords(idx);
      const nextSameRow = idx < nodes.length - 1 && getCoords(idx + 1).row === row;
      const { noLabel } = parseDecisionBranches(node.branchNote);
      const shortNo = noLabel.length > 22 ? `${noLabel.slice(0, 20)}…` : noLabel;

      if (nextSameRow) {
        // Exit bottom of diamond straight down into exception bubble
        const bx = x + nodeW / 2;
        const by1 = y + nodeH;
        const by2 = by1 + 26;
        const pillW = Math.min(200, Math.max(76, shortNo.length * 6.2 + 18));
        decisionBranchesSvg.push(
          `<path d="M ${bx} ${by1} L ${bx} ${by2}" fill="none" stroke="#dc2626" stroke-width="1.75" stroke-dasharray="4 3" marker-end="url(#proc-arrow-no)" />
          <g transform="translate(${bx - pillW / 2}, ${by2 + 3})">
            <rect width="${pillW}" height="20" rx="4" fill="#fef2f2" stroke="#dc2626" stroke-width="1.2" />
            <text x="${pillW / 2}" y="13.5" text-anchor="middle" font-size="9.5" font-weight="700" fill="#991b1b" font-family="Arial, Helvetica, sans-serif">NO: ${escapeXml(shortNo)}</text>
          </g>`
        );
      } else {
        // Row-turning node: branch NO neatly to the left/right outside edge of diamond
        const goingLeft = row % 2 === 1;
        const startX = goingLeft ? x + nodeW : x;
        const dir = goingLeft ? 1 : -1;
        const endX = startX + dir * 24;
        const midY = y + nodeH / 2;
        const pillW = Math.min(130, Math.max(66, shortNo.length * 6 + 14));
        const boxX = goingLeft ? endX + 4 : Math.max(4, endX - pillW - 4);
        decisionBranchesSvg.push(
          `<path d="M ${startX} ${midY} L ${endX} ${midY}" fill="none" stroke="#dc2626" stroke-width="1.75" stroke-dasharray="4 3" marker-end="url(#proc-arrow-no)" />
          <g transform="translate(${boxX}, ${midY - 10})">
            <rect width="${pillW}" height="20" rx="4" fill="#fef2f2" stroke="#dc2626" stroke-width="1.2" />
            <text x="${pillW / 2}" y="13.5" text-anchor="middle" font-size="9" font-weight="700" fill="#991b1b" font-family="Arial, Helvetica, sans-serif">NO: ${escapeXml(shortNo.slice(0, 15))}</text>
          </g>`
        );
      }
    }
  });

  // 2. Render Distinct BPMN / ISO Flowchart Symbols per Node Type
  nodes.forEach((node, idx) => {
    const { x, y } = getCoords(idx);
    const meta = FLOWCHART_SYMBOL_MAP[node.nodeType] || FLOWCHART_SYMBOL_MAP.process;
    const isDecision = node.nodeType === 'decision';

    let shapeSvg = '';
    if (node.nodeType === 'start') {
      // Oval / Terminator
      shapeSvg = `<rect x="${x}" y="${y}" width="${nodeW}" height="${nodeH}" rx="${nodeH / 2}" ry="${nodeH / 2}" fill="${meta.fill}" stroke="${meta.stroke}" stroke-width="2.2" />`;
    } else if (node.nodeType === 'end') {
      // Double-ring Terminator / End Event
      shapeSvg = `<rect x="${x}" y="${y}" width="${nodeW}" height="${nodeH}" rx="${nodeH / 2}" ry="${nodeH / 2}" fill="${meta.fill}" stroke="${meta.stroke}" stroke-width="3" />
        <rect x="${x + 5}" y="${y + 5}" width="${nodeW - 10}" height="${nodeH - 10}" rx="${(nodeH - 10) / 2}" ry="${(nodeH - 10) / 2}" fill="none" stroke="#475569" stroke-width="1" />`;
    } else if (node.nodeType === 'decision') {
      // True Diamond
      const cx = x + nodeW / 2;
      const cy = y + nodeH / 2;
      shapeSvg = `<polygon points="${cx},${y} ${x + nodeW},${cy} ${cx},${y + nodeH} ${x},${cy}" fill="${meta.fill}" stroke="${meta.stroke}" stroke-width="2.2" stroke-linejoin="round" />`;
    } else if (node.nodeType === 'document') {
      // Classic Document Shape with wavy bottom edge
      const bottomY = y + nodeH - 10;
      shapeSvg = `<path d="M ${x} ${y + 6} Q ${x} ${y} ${x + 6} ${y} H ${x + nodeW - 6} Q ${x + nodeW} ${y} ${x + nodeW} ${y + 6} V ${bottomY} Q ${x + nodeW * 0.75} ${bottomY - 14} ${x + nodeW * 0.5} ${bottomY} T ${x} ${bottomY} Z" fill="${meta.fill}" stroke="${meta.stroke}" stroke-width="2" />`;
    } else if (node.nodeType === 'system') {
      // Automated System Activity (Predefined Process / Double side rails + corner badge)
      shapeSvg = `<rect x="${x}" y="${y}" width="${nodeW}" height="${nodeH}" rx="8" fill="${meta.fill}" stroke="${meta.stroke}" stroke-width="2" />
        <line x1="${x + 12}" y1="${y}" x2="${x + 12}" y2="${y + nodeH}" stroke="${meta.stroke}" stroke-width="1.6" />
        <line x1="${x + nodeW - 12}" y1="${y}" x2="${x + nodeW - 12}" y2="${y + nodeH}" stroke="${meta.stroke}" stroke-width="1.6" />`;
    } else if (node.nodeType === 'database') {
      // 3D Cylinder (Database)
      const ry = 11;
      const cx = x + nodeW / 2;
      shapeSvg = `<path d="M ${x} ${y + ry} V ${y + nodeH - ry} A ${nodeW / 2} ${ry} 0 0 0 ${x + nodeW} ${y + nodeH - ry} V ${y + ry} Z" fill="${meta.fill}" stroke="${meta.stroke}" stroke-width="2" />
        <ellipse cx="${cx}" cy="${y + ry}" rx="${nodeW / 2}" ry="${ry}" fill="#ede9fe" stroke="${meta.stroke}" stroke-width="2" />`;
    } else if (node.nodeType === 'control') {
      // Control Symbol (Chamfered Octagon + inner highlight)
      const c = 16;
      shapeSvg = `<polygon points="${x + c},${y} ${x + nodeW - c},${y} ${x + nodeW},${y + c} ${x + nodeW},${y + nodeH - c} ${x + nodeW - c},${y + nodeH} ${x + c},${y + nodeH} ${x},${y + nodeH - c} ${x},${y + c}" fill="${meta.fill}" stroke="${meta.stroke}" stroke-width="2.4" stroke-linejoin="round" />
        <polygon points="${x + c + 3},${y + 4} ${x + nodeW - c - 3},${y + 4} ${x + nodeW - 4},${y + c + 3} ${x + nodeW - 4},${y + nodeH - c - 3} ${x + nodeW - c - 3},${y + nodeH - 4} ${x + c + 3},${y + nodeH - 4} ${x + 4},${y + nodeH - c - 3} ${x + 4},${y + c + 3}" fill="none" stroke="#93c5fd" stroke-width="1.2" />`;
    } else if (node.nodeType === 'manual') {
      // ISO 5807 Manual Operation Trapezoid
      const inset = 20;
      shapeSvg = `<polygon points="${x},${y} ${x + nodeW},${y} ${x + nodeW - inset},${y + nodeH} ${x + inset},${y + nodeH}" fill="${meta.fill}" stroke="${meta.stroke}" stroke-width="2" stroke-linejoin="round" />`;
    } else {
      // Standard Process Rectangle
      shapeSvg = `<rect x="${x}" y="${y}" width="${nodeW}" height="${nodeH}" rx="4" fill="${meta.fill}" stroke="${meta.stroke}" stroke-width="1.8" />`;
    }

    // Text layout inside shape (tailored per shape geometry so nothing overflows boundaries)
    const cx = x + nodeW / 2;
    const isStartOrEnd = node.nodeType === 'start' || node.nodeType === 'end';
    const isDatabase = node.nodeType === 'database';
    const isManual = node.nodeType === 'manual';
    const isSystem = node.nodeType === 'system';

    const maxLabelChars = isDecision ? 20 : isStartOrEnd || isManual ? 24 : isSystem ? 25 : 28;
    const labelLines = wrapLines(node.label, maxLabelChars, 2);

    const headerY = isDecision ? y + 23 : isDatabase ? y + 32 : y + 20;
    const titleY1 = isDecision ? y + 44 : isDatabase ? y + 50 : y + 42;
    const titleY2 = titleY1 + 15;
    const footerY = isDecision ? y + 79 : node.nodeType === 'document' ? y + nodeH - 22 : y + nodeH - 14;

    const actorLine = isDecision
      ? `${node.actorRole}`.slice(0, 22)
      : `${node.actorRole}${node.branchNote ? ` · ${node.branchNote}` : ''}`.slice(isManual || isStartOrEnd ? 26 : 33);

    nodesSvg.push(
      `<g>
        ${shapeSvg}
        <text x="${cx}" y="${headerY}" text-anchor="middle" font-size="9.5" font-weight="700" fill="${meta.textFill}" font-family="Arial, Helvetica, sans-serif">${escapeXml(`${node.stepNo} · ${meta.badgeText}`)}</text>
        <text x="${cx}" y="${titleY1}" text-anchor="middle" font-size="11.5" font-weight="700" fill="#0f172a" font-family="Arial, Helvetica, sans-serif">${escapeXml(labelLines[0] || '')}</text>
        ${labelLines[1] ? `<text x="${cx}" y="${titleY2}" text-anchor="middle" font-size="11.5" font-weight="700" fill="#0f172a" font-family="Arial, Helvetica, sans-serif">${escapeXml(labelLines[1])}</text>` : ''}
        <text x="${cx}" y="${footerY}" text-anchor="middle" font-size="9.5" fill="#64748b" font-family="Arial, Helvetica, sans-serif">${escapeXml(actorLine)}</text>
      </g>`
    );
  });

  // 3. Compact BPMN Symbol Legend Strip at bottom of diagram
  const legendY = diagramHeight + 8;
  const legendItems = FLOWCHART_SYMBOLS;
  const cellW = (svgWidth - padX * 2) / 5;
  const legendNodes = legendItems
    .map((sym, i) => {
      const row = Math.floor(i / 5);
      const col = i % 5;
      const lx = padX + col * cellW;
      const ly = legendY + row * 24;
      let miniIcon = `<rect x="${lx}" y="${ly + 3}" width="18" height="12" rx="2" fill="${sym.fill}" stroke="${sym.stroke}" stroke-width="1.4" />`;
      if (sym.type === 'start' || sym.type === 'end') {
        miniIcon = `<rect x="${lx}" y="${ly + 3}" width="18" height="12" rx="6" fill="${sym.fill}" stroke="${sym.stroke}" stroke-width="${sym.type === 'end' ? 2 : 1.4}" />`;
      } else if (sym.type === 'decision') {
        miniIcon = `<polygon points="${lx + 9},${ly + 1} ${lx + 18},${ly + 9} ${lx + 9},${ly + 17} ${lx},${ly + 9}" fill="${sym.fill}" stroke="${sym.stroke}" stroke-width="1.4" />`;
      } else if (sym.type === 'document') {
        miniIcon = `<path d="M ${lx} ${ly + 3} H ${lx + 18} V ${ly + 13} Q ${lx + 13} ${ly + 10} ${lx + 9} ${ly + 13} T ${lx} ${ly + 13} Z" fill="${sym.fill}" stroke="${sym.stroke}" stroke-width="1.4" />`;
      } else if (sym.type === 'system') {
        miniIcon = `<rect x="${lx}" y="${ly + 3}" width="18" height="12" rx="2" fill="${sym.fill}" stroke="${sym.stroke}" stroke-width="1.4" />
          <line x1="${lx + 4}" y1="${ly + 3}" x2="${lx + 4}" y2="${ly + 15}" stroke="${sym.stroke}" stroke-width="1.2" />
          <line x1="${lx + 14}" y1="${ly + 3}" x2="${lx + 14}" y2="${ly + 15}" stroke="${sym.stroke}" stroke-width="1.2" />`;
      } else if (sym.type === 'database') {
        miniIcon = `<path d="M ${lx + 1} ${ly + 6} V ${ly + 14} A 8 3 0 0 0 ${lx + 17} ${ly + 14} V ${ly + 6} Z" fill="${sym.fill}" stroke="${sym.stroke}" stroke-width="1.3" />
          <ellipse cx="${lx + 9}" cy="${ly + 6}" rx="8" ry="3" fill="#ede9fe" stroke="${sym.stroke}" stroke-width="1.3" />`;
      } else if (sym.type === 'control') {
        miniIcon = `<polygon points="${lx + 4},${ly + 3} ${lx + 14},${ly + 3} ${lx + 18},${ly + 7} ${lx + 18},${ly + 11} ${lx + 14},${ly + 15} ${lx + 4},${ly + 15} ${lx},${ly + 11} ${lx},${ly + 7}" fill="${sym.fill}" stroke="${sym.stroke}" stroke-width="1.5" />`;
      } else if (sym.type === 'manual') {
        miniIcon = `<polygon points="${lx},${ly + 3} ${lx + 18},${ly + 3} ${lx + 15},${ly + 15} ${lx + 3},${ly + 15}" fill="${sym.fill}" stroke="${sym.stroke}" stroke-width="1.4" />`;
      }
      return `<g>${miniIcon}<text x="${lx + 24}" y="${ly + 12.5}" font-size="10" font-weight="600" fill="#334155" font-family="Arial, Helvetica, sans-serif">${escapeXml(`${sym.label} (${sym.shapeName})`)}</text></g>`;
    })
    .join('');

  const svgMarkup = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}" role="img" aria-label="BPMN Process Flowchart Diagram">
  <defs>
    <marker id="proc-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1 L 10 5 L 0 9 z" fill="#475569" />
    </marker>
    <marker id="proc-arrow-yes" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1 L 10 5 L 0 9 z" fill="#059669" />
    </marker>
    <marker id="proc-arrow-no" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1 L 10 5 L 0 9 z" fill="#dc2626" />
    </marker>
  </defs>
  <rect width="${svgWidth}" height="${svgHeight}" fill="#f8fafc" />
  ${edgesSvg.join('\n  ')}
  ${decisionBranchesSvg.join('\n  ')}
  ${nodesSvg.join('\n  ')}
  <line x1="${padX}" y1="${diagramHeight}" x2="${svgWidth - padX}" y2="${diagramHeight}" stroke="#cbd5e1" stroke-width="1" />
  ${legendNodes}
</svg>`;

  return {
    svgMarkup,
    width: svgWidth,
    height: svgHeight,
  };
}

/**
 * Converts a self-contained flowchart SVG string into a crisp high-DPI PNG dataUrl & Uint8Array
 * for direct embedding in jsPDF and docx exports.
 */
export async function flowchartSvgToPng(
  nodes: ProcessFlowNode[],
  scale = 2
): Promise<{ dataUrl: string; bytes: Uint8Array; width: number; height: number } | null> {
  if (!nodes || nodes.length === 0 || typeof document === 'undefined') return null;

  const { svgMarkup, width, height } = generateProcessFlowchartSvg(nodes);
  const blob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Failed to render flowchart SVG to image.'));
      image.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, width, height);

    const dataUrl = canvas.toDataURL('image/png');
    const base64 = dataUrl.split(',')[1] || '';
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }

    return { dataUrl, bytes, width, height };
  } finally {
    URL.revokeObjectURL(url);
  }
}
