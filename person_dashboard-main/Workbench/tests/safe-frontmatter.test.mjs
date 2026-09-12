import assert from 'node:assert/strict'
import test from 'node:test'

import { parseSafeFrontmatter } from '../server/safe-frontmatter.mjs'

test('safe frontmatter parses the bounded nested subset used by synthetic reports', () => {
  const parsed = parseSafeFrontmatter(`---
type: social-insight-report
demo: true
tags: [synthetic, local]
platforms:
  - 小红书
sample:
  search_results:
    xiaohongshu: 5
---
# 正文`)
  assert.equal(parsed.data.type, 'social-insight-report')
  assert.equal(parsed.data.demo, true)
  assert.deepEqual(parsed.data.tags, ['synthetic', 'local'])
  assert.deepEqual(parsed.data.platforms, ['小红书'])
  assert.equal(parsed.data.sample.search_results.xiaohongshu, 5)
  assert.equal(parsed.content, '# 正文')
})

test('safe frontmatter rejects aliases, merge keys, duplicates and excessive nesting', () => {
  for (const source of [
    '---\na: &shared value\n---',
    '---\na: 1\n<<: *shared\n---',
    '---\na: 1\na: 2\n---',
    '---\na:\n  b:\n    c:\n      d:\n        e:\n          f: 1\n---',
  ]) assert.throws(() => parseSafeFrontmatter(source))
})
