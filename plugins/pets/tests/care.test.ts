import { describe, expect, test } from 'claude-code/testing'

import { afterTool, afterTurn, badgeOf, careFrom, fed, levelOf, milestone, newCare, welcomeBack } from '../hooks/care'
import { feelingAboutTool, fitBubble, toolLine, wrapBubble } from '../hooks/chatter'

const HOUR = 60 * 60 * 1000
const NOW = Date.UTC(2026, 9, 15, 12)

describe('looking after the pet', () => {
  test('levels grow slower as they go', () => {
    expect([0, 9, 10, 39, 40, 90, 160].map(levelOf)).toEqual([1, 1, 2, 2, 3, 4, 5])
  })

  test('replies and tools earn xp; failures only dent the mood', () => {
    const care = afterTool(afterTool(afterTurn(newCare(NOW), NOW), false), true)
    expect(care).toMatchObject({ xp: 5, turns: 1, tools: 2, mood: 71 })
  })

  test('mood drifts down while away, never below the floor, and the streak counts days', () => {
    const left = { ...newCare(NOW - 30 * HOUR), mood: 90, lastSeenAt: NOW - 10 * HOUR, lastDay: '2026-10-14', streak: 4 }
    expect(welcomeBack(left, NOW)).toMatchObject({ mood: 70, streak: 5, lastDay: '2026-10-15' })

    const longGone = { ...left, lastSeenAt: NOW - 100 * HOUR, lastDay: '2026-10-01' }
    expect(welcomeBack(longGone, NOW)).toMatchObject({ mood: 30, streak: 1 })

    const sameDay = { ...left, lastSeenAt: NOW - HOUR, lastDay: '2026-10-15' }
    expect(welcomeBack(sameDay, NOW)).toMatchObject({ mood: 88, streak: 4 })
  })

  test('a treat every half hour at most', () => {
    const first = fed(newCare(NOW), NOW)
    expect('care' in first && first.care).toMatchObject({ mood: 85, treats: 1 })

    const again = 'care' in first ? fed(first.care, NOW + 10 * 60 * 1000) : first
    expect(again).toEqual({ waitMinutes: 20 })
  })

  test('milestones are cheered once, as they are crossed', () => {
    const care = { ...newCare(NOW), turns: 9, tools: 99 }
    expect(milestone(care, afterTurn(care, NOW))).toBe('10 replies watched together!')
    expect(milestone(care, afterTool(care, false))).toBe("100 tool calls! I'm learning so much")
    expect(milestone(afterTurn(care, NOW), afterTurn(afterTurn(care, NOW), NOW))).toBeUndefined()
  })

  test('the badge shows the level and mood hearts', () => {
    expect(badgeOf({ ...newCare(NOW), xp: 45, mood: 61 })).toBe('Lv3 ♥♥♥♡♡')
  })

  test('a garbled store starts fresh, field by field', () => {
    expect(careFrom({ xp: 12, mood: 'happy', streak: 3 }, NOW)).toMatchObject({ xp: 12, mood: 70, streak: 3, adoptedAt: NOW })
    expect(careFrom('nope', NOW)).toEqual(newCare(NOW))
  })
})

describe('what the pet says', () => {
  test('what Claude is doing, in a few words, for the pet to feel about', () => {
    expect(toolLine('Read', { file_path: '/a/b/register.tsx' })).toBe('reading register.tsx')
    expect(toolLine('Bash', { command: 'ls', description: 'List the hooks folder' })).toBe('list the hooks folder')
    expect(toolLine('Bash', { command: 'git hunk list' })).toBe('running `git hunk list`')
    expect(toolLine('WebFetch', { url: 'https://example.com/a/b' })).toBe('reading example.com')
    expect(toolLine('Agent', { description: 'Research overlays' })).toBe('sending a helper to research overlays')
  })

  test("the pet's own lines are feelings, and they take turns", () => {
    expect(feelingAboutTool('Read', 0)).not.toContain('reading')
    expect(feelingAboutTool('Read', 0)).not.toBe(feelingAboutTool('Read', 1))
    expect(feelingAboutTool('mcp__linear__search', 0)).toBe('ooh, a new trick')
  })

  test('bubbles are one short line, wrapped to fit the bubble', () => {
    expect(fitBubble('  "Nice   refactor,\nClaude"  ')).toBe('Nice refactor, Claude')
    expect(fitBubble('x'.repeat(100))).toHaveLength(84)
    expect(wrapBubble('the gears are turning, slowly but surely ⚙️', 20)).toEqual(['the gears are', 'turning, slowly but', 'surely ⚙️'])
    expect(wrapBubble('x'.repeat(30), 10)).toEqual(['xxxxxxxxx…'])
  })
})
