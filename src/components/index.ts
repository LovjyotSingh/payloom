import { Registry } from '../engine/registry'
import { ButtonDef, ErrorSummaryDef, ResendTimerDef, StepsDef } from './actions'
import { CardNumberFieldDef, CvvFieldDef, ExpiryFieldDef } from './card'
import { AlertDef, BadgeDef, HeadingDef, KeyValueDef, MerchantDef, TextDef } from './content'
import { AmountFieldDef, CheckboxDef, OtpFieldDef, RadioCardsDef, SelectFieldDef, TextFieldDef } from './inputs'
import { CardDef, DividerDef, StackDef } from './layout'
import { AmountDef, OrderSummaryDef, PaymentStatusDef } from './payment'

export const ALL_COMPONENTS = [
  StackDef, CardDef, DividerDef,
  HeadingDef, TextDef, BadgeDef, KeyValueDef,
  MerchantDef, OrderSummaryDef, AmountDef, PaymentStatusDef, CardNumberFieldDef, ExpiryFieldDef, CvvFieldDef,
  TextFieldDef, AmountFieldDef, SelectFieldDef, RadioCardsDef, CheckboxDef, OtpFieldDef,
  ButtonDef, ResendTimerDef,
  AlertDef, ErrorSummaryDef, StepsDef,
]

/** The shared registry every page renders through. Teams call .extend() to add their own. */
export function createDefaultRegistry(): Registry {
  const r = new Registry()
  for (const def of ALL_COMPONENTS) r.register(def)
  return r
}

export const defaultRegistry = createDefaultRegistry()
