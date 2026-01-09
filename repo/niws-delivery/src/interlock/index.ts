export { interlock } from './socket.js';
export { encode, decode, getSignalName, getSignalCode, SIGNAL_TYPES, SIGNAL_NAMES } from './protocol.js';
export { tumbler, Tumbler } from './tumbler.js';
export { signalRouter, registerDefaultHandlers } from './handlers.js';
export type { SignalHandler } from './handlers.js';
