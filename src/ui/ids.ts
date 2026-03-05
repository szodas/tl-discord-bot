export const IDS = {
  // Rolls
  rollDo: (messageId: string) => `roll:do:${messageId}`,
  rollResults: (messageId: string) => `roll:results:${messageId}`,
  rollClose: (messageId: string) => `roll:close:${messageId}`,

  // Polls
  pollSelect: (pollId: string) => `poll:select:${pollId}`,
  pollResults: (pollId: string) => `poll:results:${pollId}`,
  pollClose: (pollId: string) => `poll:close:${pollId}`,

  // Items
  itemPick: (nonce: string, page: number) => `item:pick:${nonce}:${page}`,
  itemPrev: (nonce: string, page: number) => `item:prev:${nonce}:${page}`,
  itemNext: (nonce: string, page: number) => `item:next:${nonce}:${page}`,

  // Events
  eventTank: (eventId: string) => `event:tank:${eventId}`,
  eventHealer: (eventId: string) => `event:healer:${eventId}`,
  eventDps: (eventId: string) => `event:dps:${eventId}`,
  eventCant: (eventId: string) => `event:cant:${eventId}`,
  eventLock: (eventId: string) => `event:lock:${eventId}`,
};
