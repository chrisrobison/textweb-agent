import test from 'node:test'
import assert from 'node:assert/strict'

import { classifyElements, displayText, isInteractive } from '../src/textweb/elements.js'

// Shapes mirror a real TextWeb ref map: note there is NO `interactive` field.
const base = { href: null, label: '', role: null, ariaLabel: '', inputType: '', placeholder: null, value: null, checked: false, disabled: false, required: false }

const refMap = {
  '0': { ...base, selector: 'a.home', tag: 'a', semantic: 'link', href: 'https://example.com/home', text: 'Home' },
  '1': { ...base, selector: '#go', tag: 'button', semantic: 'button', text: 'Search' },
  '2': { ...base, selector: '#q', tag: 'input', semantic: 'input', text: 'Search the site', placeholder: 'Search the site', inputType: 'text' },
  '3': { ...base, selector: '#agree', tag: 'input', semantic: 'checkbox', text: '', label: 'I agree' },
  '4': { ...base, selector: '#cv', tag: 'input', semantic: 'file', text: 'Choose file' },
  '5': { ...base, selector: '#country', tag: 'select', semantic: 'select', text: 'Country' },
  '6': { ...base, selector: '#bio', tag: 'textarea', semantic: 'textarea', text: 'About you' },
  '7': { ...base, selector: '#nope', tag: 'button', semantic: 'button', text: 'Disabled', disabled: true },
  '8': { ...base, selector: '.mail', tag: 'a', semantic: 'link', href: 'mailto:a@b.co', text: 'Email us' },
  '9': { ...base, selector: 'h1', tag: 'h1', semantic: 'heading', text: 'Welcome' },
  '10': { ...base, selector: 'div.tab', tag: 'div', semantic: 'text', role: 'tab', text: 'Settings' },
  '11': { ...base, selector: 'p', tag: 'p', semantic: 'text', text: 'Just a paragraph' },
}

test('interactiveElements is populated from semantic, not a non-existent `interactive` flag', () => {
  const { interactiveElements } = classifyElements(refMap)
  assert.ok(interactiveElements.length > 0, 'was always empty before the fix')
  const refs = interactiveElements.map((e) => e.ref)
  assert.deepEqual(refs, ['0', '1', '2', '3', '4', '5', '6', '8', '10'])
})

test('non-interactive and disabled elements are excluded', () => {
  const refs = classifyElements(refMap).interactiveElements.map((e) => e.ref)
  assert.ok(!refs.includes('7'), 'disabled button excluded')
  assert.ok(!refs.includes('9'), 'heading excluded')
  assert.ok(!refs.includes('11'), 'plain text excluded')
})

test('role-based controls on generic elements are interactive', () => {
  assert.equal(isInteractive({ tag: 'div', semantic: 'text', role: 'tab' }), true)
  assert.equal(isInteractive({ tag: 'div', semantic: 'text', role: null }), false)
  // No semantic at all (older TextWeb): fall back to the tag.
  assert.equal(isInteractive({ tag: 'button' }), true)
  assert.equal(isInteractive({ tag: 'span' }), false)
})

test('interactive entries keep the documented shape', () => {
  const entry = classifyElements(refMap).interactiveElements.find((e) => e.ref === '1')
  assert.deepEqual(entry, { ref: '1', text: 'Search', semantic: 'button', selector: '#go' })
})

test('text falls back to label / aria-label / placeholder when there is no visible text', () => {
  assert.equal(displayText({ text: '', label: 'I agree' }), 'I agree')
  assert.equal(displayText({ text: '', label: '', ariaLabel: 'Close dialog' }), 'Close dialog')
  assert.equal(displayText({ text: null, placeholder: 'Your name' }), 'Your name')
  assert.equal(displayText({}), '')
  const checkbox = classifyElements(refMap).interactiveElements.find((e) => e.ref === '3')
  assert.equal(checkbox?.text, 'I agree')
})

test('links keep only http(s) hrefs', () => {
  const { links } = classifyElements(refMap)
  assert.deepEqual(links, [{ ref: '0', text: 'Home', href: 'https://example.com/home' }])
})

test('empty / missing ref map is safe', () => {
  assert.deepEqual(classifyElements({}), { links: [], interactiveElements: [] })
  assert.deepEqual(classifyElements(undefined as any), { links: [], interactiveElements: [] })
})
