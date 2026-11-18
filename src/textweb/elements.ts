/**
 * Classify the ref map returned by TextWeb into links and interactive elements.
 *
 * TextWeb's ref map never carries an `interactive` flag — every entry has
 * `{ selector, tag, semantic, href, text, label, ariaLabel, placeholder,
 * disabled, ... }`. The adapter used to test `element.interactive`, which is
 * always undefined, so `interactiveElements` was always empty. Interactivity
 * is derived from `semantic` (falling back to `tag` / `role`) instead.
 */

export interface RefElement {
  selector?: string
  tag?: string
  semantic?: string
  role?: string | null
  href?: string | null
  text?: string | null
  label?: string | null
  ariaLabel?: string | null
  placeholder?: string | null
  value?: string | null
  disabled?: boolean
  [key: string]: unknown
}

export interface ClassifiedElements {
  links: Array<{ ref: string; text: string; href: string }>
  interactiveElements: Array<{ ref: string; text: string; semantic: string; selector: string }>
}

// Semantics TextWeb assigns to things a user can act on.
const INTERACTIVE_SEMANTICS = new Set([
  'link',
  'button',
  'input',
  'textarea',
  'select',
  'checkbox',
  'radio',
  'file',
])

const INTERACTIVE_TAGS = new Set(['a', 'button', 'input', 'select', 'textarea'])
const INTERACTIVE_ROLES = new Set(['button', 'link', 'checkbox', 'radio', 'textbox', 'combobox', 'menuitem', 'tab', 'switch'])

export function isInteractive(element: RefElement): boolean {
  if (element.disabled) return false
  // Checked in order of reliability: TextWeb's own classification, the tag,
  // then ARIA role (for div/span widgets). Plain text, headings and list
  // items match none of these.
  if (INTERACTIVE_SEMANTICS.has(String(element.semantic || ''))) return true
  if (element.tag && INTERACTIVE_TAGS.has(String(element.tag).toLowerCase())) return true
  return !!element.role && INTERACTIVE_ROLES.has(String(element.role).toLowerCase())
}

/** Best human-readable name for an element: visible text, then labels. */
export function displayText(element: RefElement): string {
  const candidates = [element.text, element.label, element.ariaLabel, element.placeholder]
  for (const c of candidates) {
    const t = String(c ?? '').trim()
    if (t) return t
  }
  return ''
}

export function classifyElements(elements: Record<string, RefElement>): ClassifiedElements {
  const links: ClassifiedElements['links'] = []
  const interactiveElements: ClassifiedElements['interactiveElements'] = []

  for (const [ref, element] of Object.entries(elements || {})) {
    const href = typeof element.href === 'string' ? element.href : ''
    const text = displayText(element)
    const semantic = String(element.semantic || element.tag || 'unknown')
    const selector = String(element.selector || '')

    if (href && href.startsWith('http')) {
      links.push({ ref, text, href })
    }

    if (isInteractive(element)) {
      interactiveElements.push({ ref, text, semantic, selector })
    }
  }

  return { links, interactiveElements }
}
