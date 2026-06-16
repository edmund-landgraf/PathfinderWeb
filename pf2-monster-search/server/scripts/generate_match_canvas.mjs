import fs from 'fs';

const { summary, rows } = JSON.parse(
  fs.readFileSync(new URL('./match_results_table.json', import.meta.url), 'utf8')
);

const escape = (s) =>
  String(s)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, ' ');

const rowsLiteral = rows
  .map(
    (r) =>
      `  { id: ${r.id}, name: '${escape(r.name)}', match: '${escape(r.match)}', url: '${escape(r.url)}', score: ${r.score}, confidence: '${r.confidence}', alt1: '${escape(r.alt1)}', alt1Url: '${escape(r.alt1Url)}', alt2: '${escape(r.alt2)}', alt2Url: '${escape(r.alt2Url)}' }`
  )
  .join(',\n');

const canvas = `import {
  H1,
  H2,
  Link,
  Pill,
  Row,
  Select,
  Stack,
  Stat,
  Table,
  Text,
  UsageBar,
  useCanvasState,
  useHostTheme,
} from 'cursor/canvas';

const SUMMARY = {
  total: ${summary.total},
  high: ${summary.high},
  medium: ${summary.medium},
  low: ${summary.low},
  none: ${summary.none},
};

const ROWS = [
${rowsLiteral}
];

const CONFIDENCE_OPTIONS = [
  { value: 'all', label: 'All sources (${summary.total})' },
  { value: 'high', label: 'High confidence (${summary.high})' },
  { value: 'medium', label: 'Medium confidence (${summary.medium})' },
  { value: 'low', label: 'Low confidence (${summary.low})' },
  { value: 'none', label: 'No match (${summary.none})' },
  { value: 'matched', label: 'Any match (${summary.total - summary.none})' },
];

function toneForConfidence(confidence) {
  if (confidence === 'high') return 'success';
  if (confidence === 'medium') return 'info';
  if (confidence === 'low') return 'warning';
  return 'neutral';
}

export default function SourcePurchaseUrlMatches() {
  const theme = useHostTheme();
  const [filter, setFilter] = useCanvasState('filter', 'all');

  const filtered = ROWS.filter((row) => {
    if (filter === 'all') return true;
    if (filter === 'matched') return row.confidence !== 'none';
    return row.confidence === filter;
  });

  const usageSegments = [
    { label: 'High', value: SUMMARY.high, color: theme.category.green },
    { label: 'Medium', value: SUMMARY.medium, color: theme.category.blue },
    { label: 'Low', value: SUMMARY.low, color: theme.category.orange },
    { label: 'None', value: SUMMARY.none, color: theme.category.gray },
  ];

  return (
    <Stack gap={20}>
      <Stack gap={6}>
        <H1>SourceBook → Paizo Store Matches</H1>
        <Text tone="secondary">
          pf2.SourceBook has SourcePurchaseURL on all ${summary.total} rows (currently null). Matches were found by searching store.paizo.com for each source name.
        </Text>
      </Stack>

      <Row gap={12} wrap>
        <Stat label="Total sources" value={String(SUMMARY.total)} />
        <Stat label="High confidence" value={String(SUMMARY.high)} tone="success" />
        <Stat label="Medium confidence" value={String(SUMMARY.medium)} tone="info" />
        <Stat label="No match found" value={String(SUMMARY.none)} tone="neutral" />
      </Row>

      <Stack gap={8}>
        <H2>Match confidence distribution</H2>
        <UsageBar segments={usageSegments} />
        <Text tone="tertiary" size="small">Source: pf2.SourceBook queried ${new Date().toISOString().slice(0, 10)} · Paizo store search</Text>
      </Stack>

      <Row gap={12} wrap align="center">
        <Select
          value={filter}
          options={CONFIDENCE_OPTIONS}
          onChange={setFilter}
        />
        <Text tone="secondary" size="small">{filtered.length} rows shown</Text>
      </Row>

      <Table
        headers={['ID', 'SourceBook Name', 'Best Paizo Match', 'Score', 'Confidence', 'Alt Match 1', 'Alt Match 2']}
        columnAlign={['right', 'left', 'left', 'right', 'left', 'left', 'left']}
        striped
        stickyHeader
        rows={filtered.map((row) => [
          String(row.id),
          row.name,
          row.url ? <Link href={row.url}>{row.match || row.url}</Link> : <Text tone="tertiary">—</Text>,
          row.score ? String(row.score) : '—',
          <Pill tone={toneForConfidence(row.confidence)} size="small">{row.confidence}</Pill>,
          row.alt1Url ? <Link href={row.alt1Url}>{row.alt1}</Link> : '—',
          row.alt2Url ? <Link href={row.alt2Url}>{row.alt2}</Link> : '—',
        ])}
        rowTone={filtered.map((row) => toneForConfidence(row.confidence))}
      />
    </Stack>
  );
}
`;

const outPath =
  'C:/Users/edmun_9aei9sk/.cursor/projects/d-repos-PathfinderWeb-PathfinderWeb-pf2-monster-search/canvases/source-purchase-url-matches.canvas.tsx';

fs.mkdirSync('C:/Users/edmun_9aei9sk/.cursor/projects/d-repos-PathfinderWeb-PathfinderWeb-pf2-monster-search/canvases', {
  recursive: true,
});
fs.writeFileSync(outPath, canvas, 'utf8');
console.log('Wrote', outPath, 'bytes', canvas.length);
