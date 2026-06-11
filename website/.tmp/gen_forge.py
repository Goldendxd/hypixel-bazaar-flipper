import json

recs = json.load(open(r'd:\Github work\Hypixel_shenanigans\website\.tmp\forge_clean.json', encoding='utf-8'))

lines = []
lines.append('// Static forge recipe data extracted from the NotEnoughUpdates item repo.')
lines.append('// Forge recipes change only on major game updates - regenerate from NEU if needed.')
lines.append('')
lines.append('export interface ForgeRecipe {')
lines.append('  id: string')
lines.append('  name: string')
lines.append('  duration: number      // seconds for one forge run')
lines.append('  count: number         // output quantity per run')
lines.append('  hotm: number | null   // Heart of the Mountain tier required')
lines.append("  inputs: Array<{ id: string; qty: number }>")
lines.append('}')
lines.append('')
lines.append('export const FORGE_RECIPES: ForgeRecipe[] = [')
for r in recs:
    parts = []
    for i in r['inputs']:
        qty = int(i['qty']) if i['qty'] == int(i['qty']) else i['qty']
        parts.append("{ id: '%s', qty: %s }" % (i['id'], qty))
    inputs = ', '.join(parts)
    name = r['name'].replace("'", "\\'")
    hotm = r['hotm'] if r['hotm'] is not None else 'null'
    lines.append("  { id: '%s', name: '%s', duration: %d, count: %d, hotm: %s, inputs: [%s] }," % (
        r['id'], name, r['duration'], r['count'], hotm, inputs))
lines.append(']')

open(r'd:\Github work\Hypixel_shenanigans\website\lib\forgeRecipes.ts', 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
print('written', len(recs))
