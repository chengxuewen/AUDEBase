/**
 * @audebase/event-bus - Public API
 */

export { EventBus, EventBusValidationError } from './event-bus.js'
export { matchSubject } from './wildcard.js'
export type {
  EventHandler,
  EventSubscription,
  EventBusOptions,
  EventManifest,
} from './types.js'
