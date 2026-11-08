import { describe, expect, it } from 'vitest'
import { defaultRegistry } from '../components'
import { SAMPLE_PAGES } from '../pages'
import { parseJson, suggest, validatePage } from './validate'

const page = (body: unknown[], extra: Record<string, unknown> = {}) => ({ version: 1, id: 'test', title: 'Test', state: { upi: '', amount: 0 }, body, ...extra })
const messages = (r: ReturnType<typeof validatePage>) => r.errors.map((e) => `${e.path}: ${e.message}`)

describe('config validator', () => {
  it.each(SAMPLE_PAGES.map((p) => [p.id, p.page] as const))('accepts the %s sample with no errors or warnings', (_id, p) => {
    const r = validatePage(p, defaultRegistry)
    expect(messages(r)).toEqual([])
    expect(r.warnings.map((w) => `${w.path}: ${w.message}`)).toEqual([])
    expect(r.ok).toBe(true)
  })

  it('rejects unknown components and suggests the closest one', () => {
    const r = validatePage(page([{ type: 'Textfield', bind: 'upi', props: { label: 'UPI' } }]), defaultRegistry)
    expect(messages(r)).toEqual(['/body/0/type: Unknown component "Textfield". Did you mean "TextField"?'])
  })

  it('checks prop types, enums and required props with exact paths', () => {
    const r = validatePage(page([
      { type: 'Card', children: [
        { type: 'Heading', props: { level: 'two' } },
        { type: 'Alert', props: { tone: 'dangr', text: 'x' } },
      ] },
    ]), defaultRegistry)
    expect(messages(r)).toEqual([
      '/body/0/children/0/props/text: Heading requires "text"',
      '/body/0/children/0/props/level: expected number, got string',
      '/body/0/children/1/props/tone: expected one of "info", "success", "warning", "danger", got "dangr". Did you mean "danger"?',
    ])
  })

  it('reports expression syntax errors where they occur', () => {
    const r = validatePage(page([{ type: 'Text', when: "amount >", props: { text: 'Pay {{ amount | inr' } }]), defaultRegistry)
    expect(r.ok).toBe(false)
    expect(r.errors[0]!.path).toBe('/body/0/when')
    expect(r.errors[0]!.message).toMatch(/Unexpected end of expression/)
  })

  it('catches bad template formatters inside nested props', () => {
    const r = validatePage(page([{ type: 'KeyValue', props: { items: [{ label: 'A', value: '{{ amount | money }}' }] } }]), defaultRegistry)
    expect(messages(r)).toEqual(['/body/0/props/items/0/value: Unknown formatter \'money\' at position 1 in "{{ amount | money }}"'])
  })

  it('requires inputs to bind and non-inputs not to', () => {
    const r = validatePage(page([{ type: 'TextField', props: { label: 'UPI' } }, { type: 'Text', bind: 'upi', props: { text: 'x' } }]), defaultRegistry)
    expect(messages(r)).toEqual([
      '/body/0: TextField is an input and needs a "bind" state path',
      '/body/1/bind: Text is not an input and cannot bind',
    ])
  })

  it('validates rules and actions', () => {
    const r = validatePage(page([
      { type: 'TextField', bind: 'upi', props: { label: 'UPI' }, rules: [{ type: 'upii' }, { type: 'min' }, { type: 'pattern', value: '(' }] },
      { type: 'Button', props: { label: 'Pay' }, action: { type: 'submit' } },
      { type: 'Text', props: { text: 'x' }, action: { type: 'emit', event: 'x' } },
    ]), defaultRegistry)
    expect(messages(r)).toEqual([
      '/body/0/rules/0/type: Unknown rule "upii". Did you mean "upi"?',
      '/body/0/rules/1/value: min needs a numeric value',
      '/body/0/rules/2/value: pattern is not a valid regular expression',
      '/body/1/action/endpoint: submit needs an endpoint',
      '/body/2/action: Text cannot carry an action',
    ])
  })

  it('finds duplicate ids and children on leaf components', () => {
    const r = validatePage(page([
      { type: 'Text', id: 'a', props: { text: 'x' } },
      { type: 'Text', id: 'a', props: { text: 'y' }, children: [] },
    ]), defaultRegistry)
    expect(messages(r)).toEqual([
      '/body/1/id: Duplicate id "a" (first used at /body/0)',
      '/body/1/children: Text does not accept children',
    ])
  })

  it('warns, without failing, about unknown props and undeclared state', () => {
    const r = validatePage(page([{ type: 'TextField', bind: 'mobile', props: { label: 'Mobile', lable: 'x' } }]), defaultRegistry)
    expect(r.ok).toBe(true)
    expect(r.warnings.map((w) => w.message)).toEqual([
      'TextField has no prop "lable". Did you mean "label"?',
      '"mobile" is not declared in /state; it will start empty',
    ])
  })

  it('validates the page envelope and theme', () => {
    const r = validatePage({ version: 2, id: 'Bad Id', body: [], theme: { accent: 'purple' } }, defaultRegistry)
    expect(messages(r)).toEqual([
      '/version: Unsupported version 2; expected 1',
      '/id: id must be a kebab-case string',
      '/title: title is required (it becomes the page heading for screen readers)',
      '/theme/accent: accent must be a hex colour like "#7C3AED"',
      '/body: body is empty',
    ])
  })

  it('warns when a brand accent is unreadable everywhere', () => {
    const r = validatePage(page([{ type: 'Text', props: { text: 'x' } }], { theme: { accent: '#777777' } }), defaultRegistry)
    expect(r.warnings[0]!.message).toMatch(/4.48:1 contrast on white/)
  })

  it('reports JSON syntax errors with line and column', () => {
    const r = parseJson('{\n  "a": 1,\n  "b": \n}')
    expect(r.error).toBeDefined()
    expect(r.error).toMatchObject({ line: 4, col: 1, message: 'Expected a value' })
    expect(parseJson('{"a": [1, 2,]}').error).toMatchObject({ line: 1, col: 13, message: 'Trailing comma before ]' })
    expect(parseJson("{'a': 1}").error!.message).toBe('Expected a double-quoted property name')
  })

  it('suggests only close matches', () => {
    expect(suggest('Buton', ['Button', 'Badge'])).toBe('Button')
    expect(suggest('Zebra', ['Button', 'Badge'])).toBeUndefined()
  })
})
