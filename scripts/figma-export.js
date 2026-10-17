// Figma plugin snippet: exports one variable collection with values resolved per mode.
// Run it in the WDS-3.0 file (Plugins > Development > "Run once", or through the Figma MCP use_figma tool),
// once per collection: primitives, typography, theme, breakpoint, dimensions.
// Paste the result into tokens/wds-tokens.json, then run `npm run build`.
//
// Colours come out as #rrggbb or #rrggbbaa. A value that's an alias with opacity
// (used by input and checkbox backgrounds) is reported as { ref, opacity }. Convert
// it to 8-digit hex by hand, e.g. gray-0 at 15% -> #ffffff26.
const COLLECTION = 'theme';

const cols = await figma.variables.getLocalVariableCollectionsAsync();
const byId = {};
const colById = {};
for (const c of cols) {
  colById[c.id] = c;
  for (const id of c.variableIds) byId[id] = await figma.variables.getVariableByIdAsync(id);
}
const hex = (c) => {
  const h = (x) => Math.round(x * 255).toString(16).padStart(2, '0');
  const a = c.a === undefined ? 1 : c.a;
  return '#' + h(c.r) + h(c.g) + h(c.b) + (a < 1 ? h(a) : '');
};
function resolve(v, modeName) {
  const c = colById[v.variableCollectionId];
  const m = c.modes.find((m) => m.name === modeName) || c.modes[0];
  const val = v.valuesByMode[m.modeId] ?? v.valuesByMode[c.defaultModeId];
  if (val && val.type === 'VARIABLE_ALIAS') return byId[val.id] ? resolve(byId[val.id], modeName) : null;
  if (val && typeof val === 'object' && 'r' in val) return hex(val);
  if (val && typeof val === 'object' && val.color) return { ref: byId[val.color.id]?.name, opacity: val.opacity };
  return typeof val === 'number' ? Math.round(val * 100) / 100 : val;
}

const c = cols.find((c) => c.name === COLLECTION);
return {
  modes: c.modes.map((m) => m.name),
  tokens: c.variableIds.map((id) => {
    const v = byId[id];
    const first = v.valuesByMode[c.defaultModeId];
    const ref = first && first.type === 'VARIABLE_ALIAS' ? byId[first.id]?.name : undefined;
    const row = [v.name, c.modes.map((m) => resolve(v, m.name))];
    if (ref) row.push(ref);
    return row;
  }),
};
