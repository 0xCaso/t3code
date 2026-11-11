import { useAtomValue } from "@effect/atom-react";
import { parseScopedThreadKey, scopedThreadKey } from "@t3tools/client-runtime/environment";
import { parseThreadKey, threadKey } from "@t3tools/client-runtime/state/entities";
import { visibilityParentKey } from "@t3tools/client-runtime/state/threads";
import type { ScopedThreadRef } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { use, useEffect, useEffectEvent, useState } from "react";
import { createPortal } from "react-dom";

import ChatView from "./ChatView";
import { BackgroundThreadContext } from "./chat/backgroundThread";
import { useComposerDraftStore } from "../composerDraftStore";
import { isElectron } from "../env";
import { cn } from "../lib/utils";
import { useSidebarPendingFileDropStore } from "../sidebarPendingFileDropStore";
import type { ChatViewPane } from "../splitView/types";
import {
  useEnvironmentThreadRefs,
  useAnyEnvironmentHiding,
  useQuietThreadShell,
} from "../state/entities";
import { appAtomRegistry } from "../rpc/atomRegistry";
import { useEnvironmentShellStatus } from "../state/shell";
import { environmentThreadShells, threadFamilies, useEnvironmentThread } from "../state/threads";
import {
  isThreadRouteSnapshotAuthoritative,
  resolveThreadRouteRenderState,
  type ThreadRouteTarget,
} from "../threadRoutes";

/**
 * Keeps the family of an open thread the shell leaves out (an older settled thread) in the shell
 * rows until the route leaves it, so every reader of its shell row finds it.
 */
function useOpenThreadFamily(threadRef: ScopedThreadRef | null, missing: boolean) {
  const key = threadRef === null ? null : scopedThreadKey(threadRef);
  // Sticks to the route thread, so the row the family brings in does not release it.
  const [mountedKey, setMountedKey] = useState<string | null>(null);
  const nextKey = missing || mountedKey === key ? key : null;
  if (nextKey !== mountedKey) setMountedKey(nextKey);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- holds the open thread's family in the thread family registry until the route leaves it
  useEffect(() => {
    const ref = mountedKey === null ? null : parseScopedThreadKey(mountedKey);
    if (ref === null) return;
    return threadFamilies.mount(appAtomRegistry, ref.environmentId, ref.threadId);
  }, [mountedKey]);
}

/**
 * What a thread view asks its host to do instead of navigating itself: show a
 * different thread (a draft was promoted), or leave because the thread or
 * draft is gone (`redirectHome` says whether anything is left to go to).
 */
export type ThreadTargetNavigation =
  | { readonly kind: "thread"; readonly threadRef: ScopedThreadRef }
  | { readonly kind: "gone"; readonly redirectHome: boolean };

/**
 * One thread or draft inside a pane. The host decides what navigating means (a
 * route change, or a tab update in an inactive pane). Plain server threads are
 * unkeyed, so moving between them reuses one ChatView instance.
 */
export function ThreadTargetView({
  target,
  onNavigate,
  pane,
}: {
  target: ThreadRouteTarget;
  onNavigate: (next: ThreadTargetNavigation) => void;
  pane?: ChatViewPane;
}) {
  // Kept mounted under Settings or Usage: it asks for no navigation until it is shown again.
  const background = use(BackgroundThreadContext);
  const draftId = target.kind === "draft" ? target.draftId : null;
  const draftSession = useComposerDraftStore((store) =>
    draftId === null ? null : store.getDraftSession(draftId),
  );
  const draftRedirect = useComposerDraftStore((store) =>
    draftId === null ? null : store.getPromotedDraftRedirect(draftId),
  );
  const serverThreadRef = target.kind === "server" ? target.threadRef : null;
  const serverThreadShell = useQuietThreadShell(serverThreadRef);
  const shellStatus = useEnvironmentShellStatus(serverThreadRef?.environmentId ?? null);
  const environmentThreadRefs = useEnvironmentThreadRefs(serverThreadRef?.environmentId ?? null);
  const bootstrapComplete = isThreadRouteSnapshotAuthoritative(shellStatus);
  const draftThread = useComposerDraftStore((store) =>
    serverThreadRef ? store.getDraftThreadByRef(serverThreadRef) : null,
  );
  // Reached from the sidebar before finalize, the thread still has its draft.
  const serverThreadDraftId = useComposerDraftStore((store) =>
    serverThreadRef ? store.getDraftIdByRef(serverThreadRef) : null,
  );
  // The ChatView that carried a draft keeps its key through the redirect to its thread, and only
  // until the route leaves that thread, so later visits reuse the shared unkeyed ChatView.
  const [handoffKey, setHandoffKey] = useState<{ threadKey: string; key: string } | null>(null);
  const nextHandoffKey =
    draftId !== null && draftSession === null && draftRedirect
      ? handoffKey?.key === draftId
        ? handoffKey
        : { threadKey: scopedThreadKey(draftRedirect), key: draftId }
      : serverThreadRef && handoffKey?.threadKey === scopedThreadKey(serverThreadRef)
        ? handoffKey
        : serverThreadRef && serverThreadDraftId
          ? { threadKey: scopedThreadKey(serverThreadRef), key: serverThreadDraftId }
          : null;
  if (nextHandoffKey !== handoffKey) {
    setHandoffKey(nextHandoffKey);
  }
  const environmentHasDraftThreads = useComposerDraftStore((store) =>
    serverThreadRef ? store.hasDraftThreadsInEnvironment(serverThreadRef.environmentId) : false,
  );
  // Until the shell lists the thread, its own load (HTTP, then the socket)
  // decides whether it exists. Read only then: once listed, ChatView keeps
  // this stream open and its updates need not re-render the route.
  const unlistedThreadRef =
    target.kind === "server" && serverThreadShell === null && draftThread === null
      ? target.threadRef
      : null;
  const unlistedThreadDetail = useEnvironmentThread(
    unlistedThreadRef?.environmentId ?? null,
    unlistedThreadRef?.threadId ?? null,
  );
  useOpenThreadFamily(serverThreadRef, bootstrapComplete && unlistedThreadRef !== null);
  const hiddenKeys = useAtomValue(environmentThreadShells.hiddenThreadKeysAtom);
  const unlistedThread = Option.getOrNull(Option.map(unlistedThreadDetail.data, (p) => p.thread));
  const unlistedParentKey =
    unlistedThreadRef === null || unlistedThread === null
      ? null
      : visibilityParentKey(unlistedThreadRef.environmentId, unlistedThread);
  const unlistedParentShell = useQuietThreadShell(
    unlistedParentKey === null ? null : parseThreadKey(unlistedParentKey),
  );
  const hidingAnywhere = useAnyEnvironmentHiding();
  const draftRedirectShell = useQuietThreadShell(draftRedirect ?? null);
  const hiddenByTagFilter = serverThreadRef !== null && hiddenKeys.has(threadKey(serverThreadRef));
  // Cached detail can predate a tag or an archive, so while hiding an off-shell thread opens only
  // as the child of a loaded, visible parent (lineage never changes); anything else stays closed.
  const offShellBlocked =
    hidingAnywhere &&
    unlistedThreadRef !== null &&
    !(
      unlistedParentKey !== null &&
      unlistedParentShell !== null &&
      !hiddenKeys.has(unlistedParentKey)
    );
  const renderState = resolveThreadRouteRenderState({
    bootstrapComplete,
    serverThreadExists: serverThreadShell !== null,
    serverThreadDeleted: serverThreadShell?.deletedAt != null,
    unlistedThreadDetail,
    draftThreadExists: draftThread !== null,
  });
  const environmentHasAnyThreads = environmentThreadRefs.length > 0 || environmentHasDraftThreads;
  const draftSessionHidden =
    draftSession !== null &&
    hiddenKeys.has(
      threadKey({ environmentId: draftSession.environmentId, threadId: draftSession.threadId }),
    );
  const draftRedirectHidden = !!draftRedirect && hiddenKeys.has(threadKey(draftRedirect));
  // Hidden (tag filter, archive) threads never mount; the host leaves them like a gone thread.
  const leaveHidden =
    target.kind === "draft"
      ? draftSessionHidden || (draftSession === null && draftRedirectHidden)
      : hiddenByTagFilter || (offShellBlocked && bootstrapComplete && unlistedThread !== null);

  const navigateTo = useEffectEvent(onNavigate);
  // Draft promotion runs in the draft store. Follow the redirect it leaves behind,
  // or leave a draft that is gone.
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- follows the draft store's promotion redirect through onNavigate
  useEffect(() => {
    if (background || target.kind !== "draft" || draftSession || leaveHidden) return;
    navigateTo(
      draftRedirect
        ? { kind: "thread", threadRef: draftRedirect }
        : { kind: "gone", redirectHome: true },
    );
  }, [background, draftRedirect, draftSession, leaveHidden, target.kind]);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- clears pending file drops and leaves through onNavigate once a server thread is confirmed missing
  useEffect(() => {
    if (target.kind !== "server" || !bootstrapComplete) {
      return;
    }
    if (renderState === "missing") {
      const { clearPendingFileDropsForThread } = useSidebarPendingFileDropStore.getState();
      clearPendingFileDropsForThread(target.threadRef);
      if (!background) onNavigate({ kind: "gone", redirectHome: environmentHasAnyThreads });
    }
  }, [background, bootstrapComplete, environmentHasAnyThreads, onNavigate, renderState, target]);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- leaves a hidden thread through onNavigate
  useEffect(() => {
    if (!background && leaveHidden) navigateTo({ kind: "gone", redirectHome: true });
  }, [background, leaveHidden]);

  let view: React.ReactNode = null;
  if (leaveHidden) {
    // A hidden thread or a draft mid-promotion into one: never mount it.
  } else if (target.kind === "draft") {
    if (draftSession) {
      view = (
        <ChatView
          key={target.draftId}
          draftId={target.draftId}
          environmentId={draftSession.environmentId}
          threadId={draftSession.threadId}
          routeKind="draft"
          forceExpandedMobileComposer
          pane={pane}
        />
      );
    } else if (draftRedirect && hidingAnywhere && draftRedirectShell === null) {
      // While hiding, a thread outside the live list is judged by the server target, unmounted here.
    } else if (draftRedirect) {
      // Same slot and key as the server route renders, so the swap keeps this instance.
      view = (
        <ChatView
          key={target.draftId}
          environmentId={draftRedirect.environmentId}
          threadId={draftRedirect.threadId}
          routeKind="server"
          pane={pane}
        />
      );
    }
  } else if (offShellBlocked) {
    // Before the shell bootstraps, a listed visible thread can still look off-shell.
  } else if (renderState === "ready" || (renderState === "loading" && serverThreadShell !== null)) {
    view = (
      <ChatView
        key={nextHandoffKey?.key}
        environmentId={target.threadRef.environmentId}
        threadId={target.threadRef.threadId}
        routeKind="server"
        pane={pane}
      />
    );
  }

  if (view || !pane) return view;
  // A pane whose thread never loads (its environment is gone or unreachable) still needs its
  // tab bar, or the persisted layout leaves a blank pane with no way to close it. While active it
  // also holds the header's place, so the tab bar does not jump and Electron keeps its drag region.
  return (
    <>
      {pane.active && pane.slots.header
        ? createPortal(
            <header
              aria-hidden
              className={cn(
                "h-[var(--workspace-topbar-height)] shrink-0 bg-background",
                isElectron && "drag-region",
              )}
            />,
            pane.slots.header,
          )
        : null}
      {pane.renderTabBar(null)}
    </>
  );
}
