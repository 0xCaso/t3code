import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { use, useEffect, useEffectEvent, useState } from "react";
import { createPortal } from "react-dom";

import ChatView from "./ChatView";
import { BackgroundThreadContext } from "./chat/backgroundThread";
import { useComposerDraftStore } from "../composerDraftStore";
import { isElectron } from "../env";
import { cn } from "../lib/utils";
import { useSidebarPendingFileDropStore } from "../sidebarPendingFileDropStore";
import type { ChatViewPane } from "../splitView/types";
import { useEnvironmentThreadRefs, useQuietThreadShell } from "../state/entities";
import { useEnvironmentShellStatus } from "../state/shell";
import { useEnvironmentThread } from "../state/threads";
import {
  isThreadRouteSnapshotAuthoritative,
  resolveThreadRouteRenderState,
  type ThreadRouteTarget,
} from "../threadRoutes";

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
  const renderState = resolveThreadRouteRenderState({
    bootstrapComplete,
    serverThreadExists: serverThreadShell !== null,
    serverThreadDeleted: serverThreadShell?.deletedAt != null,
    unlistedThreadDetail,
    draftThreadExists: draftThread !== null,
  });
  const environmentHasAnyThreads = environmentThreadRefs.length > 0 || environmentHasDraftThreads;

  const navigateTo = useEffectEvent(onNavigate);
  // Draft promotion runs in the draft store. Follow the redirect it leaves behind,
  // or leave a draft that is gone.
  useEffect(() => {
    if (background || target.kind !== "draft" || draftSession) return;
    navigateTo(
      draftRedirect
        ? { kind: "thread", threadRef: draftRedirect }
        : { kind: "gone", redirectHome: true },
    );
  }, [background, draftRedirect, draftSession, target.kind]);

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

  let view: React.ReactNode = null;
  if (target.kind === "draft") {
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
