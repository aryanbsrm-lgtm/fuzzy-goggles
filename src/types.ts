export interface ParsedPayload {
  /** The extracted value / number pattern (e.g. "240-6", "140-58-350", "45") */
  value: string;
  /** Market or Channel / Category Name (e.g. "MILAN DAY", "KALYAN", "RAJDHANI DAY") */
  marketName: string;
  /** Session timing (e.g. "OPEN", "CLOSE", "JODI") */
  session?: 'OPEN' | 'CLOSE' | 'JODI';
  /** Optional round/event ID */
  roundId?: string;
  /** Raw message text */
  rawText: string;
  /** WhatsApp group or channel JID */
  groupJid: string;
  /** Friendly group or channel name */
  groupName?: string;
  /** Identifier of the owner/source entity (e.g. "owner_prakash", "owner_live_khabar") */
  ownerId?: string;
  /** Sender's WhatsApp JID */
  senderJid: string;
  /** Sender's name */
  senderName?: string;
  /** Message timestamp (unix ms) */
  timestamp: number;
}

export interface GroupMatchRecord {
  groupJid: string;
  groupName?: string;
  ownerId?: string;
  senderJid: string;
  senderName?: string;
  rawText: string;
  timestamp: number;
}

export interface ConsensusCandidate {
  /** Unique composite key: `${today}::${marketName}::${session}::${value}` */
  key: string;
  /** Market Name */
  marketName: string;
  /** Session type */
  session?: 'OPEN' | 'CLOSE' | 'JODI';
  /** Candidate Value */
  value: string;
  /** Optional round/batch ID */
  roundId?: string;
  /** List of distinct source matches */
  matches: GroupMatchRecord[];
  /** Timestamp of first match */
  firstSeenAt: number;
  /** Timestamp of last match */
  lastSeenAt: number;
  /** Status of candidate */
  status: 'pending' | 'verified' | 'unverified';
}

export interface VerifiedPayloadEvent {
  marketName: string;
  session?: 'OPEN' | 'CLOSE' | 'JODI';
  value: string;
  isVerified: boolean; // true = ✅ Verified, false = ❌ Unverified
  isUpgrade?: boolean; // true if upgraded in-place from previously published unverified alert
  matches: GroupMatchRecord[];
  firstSeenAt: number;
  confirmedAt: number;
  timeToConsensusMs: number;
  sessionKey: string;
  telegramMessageId?: number;
  whatsappMessageKeys?: Record<string, any>;
}

export interface DispatchedSessionRecord {
  marketName: string;
  session?: 'OPEN' | 'CLOSE' | 'JODI';
  value: string;
  isVerified: boolean;
  dispatchedAt: number;
  matches: GroupMatchRecord[];
  firstSeenAt: number;
  telegramMessageId?: number;
  whatsappMessageKeys?: Record<string, any>;
}

export interface BridgeStats {
  startedAt: number;
  totalMessagesReceived: number;
  totalPayloadsParsed: number;
  totalConsensusReached: number;
  totalUnverifiedDispatched: number;
}

export interface ApprovedChatInfo {
  chatId: string;
  title: string;
  type: 'group' | 'supergroup' | 'channel' | 'private';
  approvedAt: number;
  approvedBy?: string;
  addedBy?: {
    id: number;
    firstName?: string;
    username?: string;
  };
  customTemplate?: string;
  customHeader?: string;
  customFooter?: string;
  buttonText?: string;
  buttonUrl?: string;
  botToken?: string;
  botUsername?: string;
  botName?: string;
}

export interface PendingGroupRequest {
  chatId: string;
  title: string;
  type: 'group' | 'supergroup' | 'channel' | 'private';
  requestedAt: number;
  addedBy?: {
    id: number;
    firstName?: string;
    username?: string;
  };
}

export interface DpbossScrapedMarket {
  marketName: string;
  value: string;
  openTime?: string;
  closeTime?: string;
  session?: 'OPEN' | 'CLOSE' | 'JODI';
  rawText?: string;
}

export interface GameResultApiRequest {
  gameName: string;
  date?: string;
  gameSession?: 'OPEN' | 'CLOSE' | 'JODI' | 'ALL' | string;
  session?: 'OPEN' | 'CLOSE' | 'JODI' | 'ALL' | string;
  hashKey?: string;
  key?: string;
  apiKey?: string;
  hash?: string;
  signature?: string;
}

export interface GameResultData {
  gameName: string;
  marketName: string;
  slug: string;
  date: string;
  session: 'OPEN' | 'CLOSE' | 'JODI' | 'ALL';
  status: 'VERIFIED' | 'PENDING' | 'NOT_DECLARED';
  isDeclared: boolean;
  isVerified: boolean;
  result?: string;
  answer?: string;
  responseFormat?: 'result' | 'answer';
  openPana?: string;
  openDigit?: string;
  closeDigit?: string;
  closePana?: string;
  jodi?: string;
  fullResult?: string;
  openTime?: string;
  closeTime?: string;
  lastUpdated?: string;
  timestamp: number;
}

export interface GameResultApiResponse {
  success: boolean;
  code: string;
  error?: string;
  data?: GameResultData;
}


