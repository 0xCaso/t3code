import { pipe } from "effect/Function";
import type { AssistantCitation } from "@t3tools/contracts";
import {
  formatAssistantCitationHref,
  parseAssistantCitationHref,
} from "@t3tools/shared/assistantCitations";
import * as Base64Url from "effect/encoding/Base64Url";
import * as Result from "effect/Result";

import { randomUUID } from "./utils";

declare module "@tanstack/react-router" {
  interface HistoryState {
    assistantCitationActivation?: string;
  }
}

const CITATION_HASH_PREFIX = "assistant-citation=";

/** Base64url keeps router hash normalization from decoding quote whitespace or source IDs. */
export function assistantCitationHash(citation: AssistantCitation) {
  return `${CITATION_HASH_PREFIX}${Base64Url.encode(formatAssistantCitationHref(citation))}`;
}

export function assistantCitationFromLocation(href: string) {
  const hashIndex = href.indexOf("#");
  if (hashIndex === -1) return null;
  const hash = href.slice(hashIndex + 1);
  if (!hash.startsWith(CITATION_HASH_PREFIX) || hash.length > 140_000) return null;
  try {
    return pipe(
      hash.slice(CITATION_HASH_PREFIX.length),
      Base64Url.decodeString,
      Result.getOrThrow,
      parseAssistantCitationHref,
    );
  } catch {
    return null;
  }
}

/**
 * The location's href when its citation points at this thread, else null. A primitive, so a
 * router selector built on it re-renders only the thread the citation targets.
 */
export function threadCitationHref(href: string, environmentId: string, threadId: string) {
  const citation = assistantCitationFromLocation(href);
  return citation?.environmentId === environmentId && citation.threadId === threadId ? href : null;
}

/**
 * Identifies one activation of this thread's citation (a re-click of the same link gets a new
 * one), or null when the location cites nothing here.
 */
export function threadCitationActivation(
  location: {
    readonly href: string;
    readonly state: { assistantCitationActivation?: string; __TSR_key?: string };
  },
  environmentId: string,
  threadId: string,
) {
  if (threadCitationHref(location.href, environmentId, threadId) === null) return null;
  return location.state.assistantCitationActivation ?? location.state.__TSR_key ?? location.href;
}

/** A fresh activation lets the same link reveal its source again after dismissal. */
export function assistantCitationNavigation(citation: AssistantCitation) {
  return {
    to: "/$environmentId/$threadId" as const,
    params: { environmentId: citation.environmentId, threadId: citation.threadId },
    hash: assistantCitationHash(citation),
    resetScroll: false,
    state: { assistantCitationActivation: randomUUID() },
  };
}
