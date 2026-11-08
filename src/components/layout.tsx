import { useId } from 'react'
import type { ComponentDef, RenderProps } from '../engine/registry'
import { cx, numOr, str } from './shared'

type StackProps = { direction?: string; gap?: string; align?: string; justify?: string; wrap?: boolean }
function Stack({ props, children }: RenderProps<StackProps>) {
  return (
    <div
      className={cx('pl-stack', props.direction === 'row' && 'is-row', props.wrap && 'is-wrap')}
      data-gap={props.gap ?? 'md'}
      data-align={props.align ?? 'stretch'}
      data-justify={props.justify ?? 'start'}
    >
      {children}
    </div>
  )
}

export const StackDef: ComponentDef<StackProps> = {
  type: 'Stack',
  category: 'Layout',
  description: 'Lays children out in a column or row with a consistent gap from the spacing scale.',
  component: Stack,
  children: true,
  props: {
    direction: { type: 'enum', values: ['column', 'row'], default: 'column', description: 'Main axis.' },
    gap: { type: 'enum', values: ['none', 'xs', 'sm', 'md', 'lg', 'xl'], default: 'md', description: 'Space between children.' },
    align: { type: 'enum', values: ['start', 'center', 'end', 'stretch'], default: 'stretch', description: 'Cross-axis alignment.' },
    justify: { type: 'enum', values: ['start', 'center', 'end', 'between'], default: 'start', description: 'Main-axis distribution.' },
    wrap: { type: 'boolean', default: false, description: 'Wrap rows onto new lines on narrow screens.' },
  },
  example: {
    type: 'Stack', props: { direction: 'row', gap: 'sm', wrap: true },
    children: [
      { type: 'Badge', props: { text: 'UPI', tone: 'accent' } },
      { type: 'Badge', props: { text: 'Cards' } },
      { type: 'Badge', props: { text: 'Netbanking' } },
    ],
  },
}

type CardProps = { title?: string; description?: string; level?: number; padding?: string; tone?: string }
function Card({ props, children }: RenderProps<CardProps>) {
  const id = useId()
  const level = Math.min(4, Math.max(2, numOr(props.level, 2)))
  const H = `h${level}` as 'h2'
  return (
    <section
      className={cx('pl-card', props.tone === 'subtle' && 'is-subtle', props.padding === 'none' && 'is-flush')}
      aria-labelledby={props.title ? id : undefined}
    >
      {props.title && (
        <header className="pl-card-head">
          <H id={id} className="pl-card-title">{str(props.title)}</H>
          {props.description && <p className="pl-card-desc">{str(props.description)}</p>}
        </header>
      )}
      <div className="pl-card-body">{children}</div>
    </section>
  )
}

export const CardDef: ComponentDef<CardProps> = {
  type: 'Card',
  category: 'Layout',
  description: 'A surface that groups related content. With a title it becomes a labelled landmark region.',
  component: Card,
  children: true,
  props: {
    title: { type: 'string', description: 'Heading; also names the region for screen readers.' },
    description: { type: 'string', description: 'Supporting line under the title.' },
    level: { type: 'number', default: 2, description: 'Heading level (2-4) so the page outline stays correct.' },
    tone: { type: 'enum', values: ['default', 'subtle'], default: 'default', description: 'Visual weight.' },
    padding: { type: 'enum', values: ['default', 'none'], default: 'default', description: 'Use none for edge-to-edge content.' },
  },
  example: {
    type: 'Card', props: { title: 'Delivery address', description: 'Where should we send it?' },
    children: [{ type: 'Text', props: { text: '21 MG Road, Bengaluru 560001' } }],
  },
}

type DividerProps = { label?: string }
function Divider({ props }: RenderProps<DividerProps>) {
  if (!props.label) return <hr className="pl-divider" />
  return (
    <div className="pl-divider-label" role="separator" aria-label={str(props.label)}>
      <span aria-hidden="true">{str(props.label)}</span>
    </div>
  )
}

export const DividerDef: ComponentDef<DividerProps> = {
  type: 'Divider',
  category: 'Layout',
  description: 'A thematic break, optionally labelled ("or").',
  component: Divider,
  props: { label: { type: 'string', description: 'Short text centred on the line.' } },
  example: { type: 'Divider', props: { label: 'or pay with' } },
}
