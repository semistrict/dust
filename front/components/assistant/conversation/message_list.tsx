/* biome-ignore-all lint/correctness/useHookAtTopLevel: forwardRef component implementation */

"use client";

import { cn } from "@dust-tt/sparkle";
import type React from "react";
import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type ScrollBehavior =
  | "instant"
  | "smooth"
  | (() => {
      animationFrameCount?: number;
      easing?: (x: number) => number;
    });

type ScrollAlign = "start" | "end";

type ScrollInstruction = {
  index: number | "LAST";
  align: ScrollAlign;
  behavior?: ScrollBehavior;
};

export type ListScrollLocation = {
  bottomOffset: number;
  isAtBottom: boolean;
  listOffset: number;
  visibleListHeight: number;
};

type ScrollLocationWithIndex = {
  scrollLocation: ListScrollLocation;
};

type DataMutator<TItem> = {
  append: (
    items: TItem[],
    scroll?:
      | boolean
      | ((params: ScrollLocationWithIndex) => false | ScrollInstruction)
  ) => void;
  find: (predicate: (item: TItem) => boolean) => TItem | undefined;
  findIndex: (predicate: (item: TItem) => boolean) => number;
  findAndDelete: (predicate: (item: TItem) => boolean) => void;
  get: () => TItem[];
  insert: (items: TItem[], index: number, scroll?: boolean) => void;
  map: (mapper: (item: TItem) => TItem) => void;
  prepend: (items: TItem[]) => void;
};

export type VirtuosoMessageListMethods<TItem, _TContext = unknown> = {
  data: DataMutator<TItem>;
  getScrollLocation: () => ListScrollLocation;
  height: (item: TItem) => number;
  top: (item: TItem) => number;
  scrollToItem: (location: ScrollInstruction) => void;
};

type MessageListContextValue<TItem, TContext> = {
  context: TContext;
  itemIdentity: (item: TItem) => string;
  location: ListScrollLocation;
  methods: VirtuosoMessageListMethods<TItem, TContext>;
  registerItemElement: (
    identity: string,
    element: HTMLDivElement | null,
    height: number
  ) => void;
};

const MessageListContext = createContext<MessageListContextValue<
  unknown,
  unknown
> | null>(null);

export function useVirtuosoMethods<TItem, TContext = unknown>() {
  const context = useContext(MessageListContext);
  if (!context) {
    throw new Error(
      "useVirtuosoMethods must be used within VirtuosoMessageList"
    );
  }
  return context.methods as VirtuosoMessageListMethods<TItem, TContext>;
}

export function useVirtuosoLocation() {
  const context = useContext(MessageListContext);
  if (!context) {
    throw new Error(
      "useVirtuosoLocation must be used within VirtuosoMessageList"
    );
  }
  return context.location;
}

const EMPTY_SCROLL_LOCATION: ListScrollLocation = {
  bottomOffset: 0,
  isAtBottom: true,
  listOffset: 0,
  visibleListHeight: 0,
};

const FOOTER_SPACER_PX = 16;

function getLocation(
  element: HTMLDivElement | null | undefined,
  footerHeight = 0
): ListScrollLocation {
  if (!element) {
    return EMPTY_SCROLL_LOCATION;
  }

  const scrollTop = element.scrollTop;
  const visibleListHeight = element.clientHeight;
  const rawBottomOffset = Math.max(
    0,
    element.scrollHeight - visibleListHeight - scrollTop
  );
  const bottomOffset = Math.max(
    0,
    rawBottomOffset - footerHeight - FOOTER_SPACER_PX
  );

  return {
    bottomOffset,
    isAtBottom: bottomOffset <= 4,
    listOffset: -scrollTop,
    visibleListHeight,
  };
}

function toNativeBehavior(
  behavior?: ScrollBehavior
): ScrollToOptions["behavior"] {
  if (typeof behavior === "function") {
    return "smooth";
  }

  return behavior ?? "instant";
}

type VirtuosoMessageListProps<TItem, TContext> = {
  ItemContent: React.ComponentType<{
    context: TContext;
    data: TItem;
    nextData: TItem | null;
    prevData: TItem | null;
  }>;
  StickyFooter?: React.ComponentType<{ context: TContext }>;
  StickyHeader?: React.ComponentType<{ context: TContext }>;
  EmptyPlaceholder?: React.ComponentType;
  className?: string;
  computeItemKey?: (args: { context: TContext; data: TItem }) => string;
  context: TContext;
  data: {
    data?: TItem[];
    scrollModifier?: {
      location: ScrollInstruction;
      purgeItemSizes?: boolean;
      type: "item-location";
    };
  };
  enforceStickyFooterAtBottom?: boolean;
  increaseViewportBy?: number;
  itemIdentity: (item: TItem) => string;
  onRenderedDataChange?: (renderedData: TItem[]) => void;
  onScroll?: (location: ListScrollLocation) => void;
  shortSizeAlign?: "top" | "bottom";
};

type PendingLayoutEffect =
  | { type: "keep-bottom" }
  | { type: "preserve-top"; previousHeight: number; previousTop: number }
  | { type: "scroll"; location: ScrollInstruction }
  | null;

const MeasureRow = ({
  children,
  identity,
  registerItemElement,
}: {
  children: React.ReactNode;
  identity: string;
  registerItemElement: (
    identity: string,
    element: HTMLDivElement | null,
    height: number
  ) => void;
}) => {
  const rowRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const element = rowRef.current;
    if (!element) {
      registerItemElement(identity, null, 0);
      return;
    }

    const update = () => {
      registerItemElement(identity, element, element.offsetHeight);
    };

    update();

    const observer = new ResizeObserver(update);
    observer.observe(element);

    return () => {
      observer.disconnect();
      registerItemElement(identity, null, 0);
    };
  }, [identity, registerItemElement]);

  return <div ref={rowRef}>{children}</div>;
};

function VirtuosoMessageListInner(
  {
    ItemContent,
    StickyFooter,
    StickyHeader,
    EmptyPlaceholder,
    className,
    computeItemKey,
    context,
    data,
    itemIdentity,
    onRenderedDataChange,
    onScroll,
  }: VirtuosoMessageListProps<any, any>,
  ref: React.ForwardedRef<VirtuosoMessageListMethods<any, any>>
) {
  const [items, setItems] = useState<any[]>(() => data.data ?? []);
  const [location, setLocation] = useState<ListScrollLocation>(
    EMPTY_SCROLL_LOCATION
  );
  const [footerHeight, setFooterHeight] = useState(0);

  const initializedFromPropsRef = useRef(false);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const footerRef = useRef<HTMLDivElement | null>(null);
  const heightsRef = useRef(new Map<string, number>());
  const elementsRef = useRef(new Map<string, HTMLDivElement>());
  const itemsRef = useRef<any[]>(items);
  const pendingLayoutEffectRef = useRef<PendingLayoutEffect>(null);
  const hasAppliedInitialScrollRef = useRef(false);

  useEffect(() => {
    itemsRef.current = items;
    onRenderedDataChange?.(items);
  }, [items, onRenderedDataChange]);

  useEffect(() => {
    if (!initializedFromPropsRef.current && data.data && data.data.length > 0) {
      initializedFromPropsRef.current = true;
      setItems(data.data);
    }
  }, [data.data]);

  const updateLocation = useCallback(() => {
    const nextLocation = getLocation(scrollContainerRef.current, footerHeight);
    setLocation(nextLocation);
    onScroll?.(nextLocation);
    return nextLocation;
  }, [footerHeight, onScroll]);

  useEffect(() => {
    updateLocation();
    const handleResize = () => {
      updateLocation();
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [updateLocation]);

  useLayoutEffect(() => {
    if (!footerRef.current) {
      return;
    }

    const element = footerRef.current;
    const update = () => {
      setFooterHeight(element.offsetHeight);
    };

    update();

    const observer = new ResizeObserver(update);
    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  const scrollToItem = useCallback(
    ({ index, align, behavior }: ScrollInstruction) => {
      const container = scrollContainerRef.current;
      if (!container || itemsRef.current.length === 0) {
        return;
      }

      const targetIndex =
        index === "LAST" ? itemsRef.current.length - 1 : Math.max(0, index);
      const targetItem = itemsRef.current[targetIndex];
      if (!targetItem) {
        return;
      }

      const identity = itemIdentity(targetItem);
      const element = elementsRef.current.get(identity);
      if (!element) {
        return;
      }

      const containerRect = container.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();
      const top = elementRect.top - containerRect.top + container.scrollTop;
      const height = elementRect.height;
      const visibleViewportHeight = Math.max(
        0,
        container.clientHeight - footerHeight - FOOTER_SPACER_PX
      );
      const nextTop =
        align === "end" ? top + height - visibleViewportHeight : top;

      container.scrollTo({
        top: Math.max(0, nextTop),
        behavior: toNativeBehavior(behavior),
      });
    },
    [footerHeight, itemIdentity]
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: needs to run after item mutations render.
  useLayoutEffect(() => {
    const pending = pendingLayoutEffectRef.current;
    if (!pending) {
      updateLocation();
      return;
    }

    const container = scrollContainerRef.current;
    if (!container) {
      pendingLayoutEffectRef.current = null;
      updateLocation();
      return;
    }

    switch (pending.type) {
      case "keep-bottom":
        container.scrollTop = container.scrollHeight;
        break;
      case "preserve-top":
        container.scrollTop =
          pending.previousTop +
          (container.scrollHeight - pending.previousHeight);
        break;
      case "scroll":
        scrollToItem(pending.location);
        break;
    }

    pendingLayoutEffectRef.current = null;
    updateLocation();
  }, [items, scrollToItem, updateLocation]);

  useLayoutEffect(() => {
    if (
      hasAppliedInitialScrollRef.current ||
      !data.scrollModifier ||
      items.length === 0
    ) {
      return;
    }

    hasAppliedInitialScrollRef.current = true;
    pendingLayoutEffectRef.current = {
      type: "scroll",
      location: data.scrollModifier.location,
    };
  }, [data.scrollModifier, items.length]);

  const registerItemElement = useCallback(
    (identity: string, element: HTMLDivElement | null, height: number) => {
      if (element) {
        elementsRef.current.set(identity, element);
        heightsRef.current.set(identity, height);
      } else {
        elementsRef.current.delete(identity);
        heightsRef.current.delete(identity);
      }
    },
    []
  );

  const methods = useMemo<VirtuosoMessageListMethods<any, any>>(() => {
    const makeAppendScrollInstruction = (
      scroll:
        | boolean
        | ((params: ScrollLocationWithIndex) => false | ScrollInstruction)
        | undefined
    ) => {
      const currentLocation = getLocation(
        scrollContainerRef.current,
        footerHeight
      );

      if (typeof scroll === "function") {
        return scroll({ scrollLocation: currentLocation });
      }

      if (
        scroll === true ||
        (scroll === undefined && currentLocation.isAtBottom)
      ) {
        return {
          index: "LAST" as const,
          align: "end" as const,
          behavior: "smooth" as const,
        };
      }

      return false;
    };

    return {
      data: {
        append: (nextItems, scroll) => {
          const currentLocation = getLocation(
            scrollContainerRef.current,
            footerHeight
          );
          const instruction = makeAppendScrollInstruction(scroll);
          if (instruction) {
            pendingLayoutEffectRef.current =
              currentLocation.isAtBottom &&
              instruction.index === "LAST" &&
              instruction.align === "end"
                ? { type: "keep-bottom" }
                : {
                    type: "scroll",
                    location: instruction,
                  };
          }
          setItems((current) => [...current, ...nextItems]);
        },
        find: (predicate) => itemsRef.current.find(predicate),
        findIndex: (predicate) => itemsRef.current.findIndex(predicate),
        findAndDelete: (predicate) => {
          const currentLocation = getLocation(
            scrollContainerRef.current,
            footerHeight
          );
          if (currentLocation.isAtBottom) {
            pendingLayoutEffectRef.current = { type: "keep-bottom" };
          }
          setItems((current) => current.filter((item) => !predicate(item)));
        },
        get: () => itemsRef.current,
        insert: (nextItems, index, scroll) => {
          if (scroll) {
            pendingLayoutEffectRef.current = {
              type: "scroll",
              location: {
                index,
                align: "start",
                behavior: "smooth",
              },
            };
          }

          setItems((current) => {
            const copy = current.slice();
            copy.splice(index, 0, ...nextItems);
            return copy;
          });
        },
        map: (mapper) => {
          const currentLocation = getLocation(
            scrollContainerRef.current,
            footerHeight
          );
          if (currentLocation.isAtBottom) {
            pendingLayoutEffectRef.current = { type: "keep-bottom" };
          }
          setItems((current) => current.map(mapper));
        },
        prepend: (nextItems) => {
          const container = scrollContainerRef.current;
          pendingLayoutEffectRef.current = container
            ? {
                type: "preserve-top",
                previousHeight: container.scrollHeight,
                previousTop: container.scrollTop,
              }
            : null;
          setItems((current) => [...nextItems, ...current]);
        },
      },
      getScrollLocation: () =>
        getLocation(scrollContainerRef.current, footerHeight),
      height: (item) => heightsRef.current.get(itemIdentity(item)) ?? 0,
      top: (item) => {
        const element = elementsRef.current.get(itemIdentity(item));
        const container = scrollContainerRef.current;
        if (!element || !container) {
          return 0;
        }

        const containerRect = container.getBoundingClientRect();
        const elementRect = element.getBoundingClientRect();
        return elementRect.top - containerRect.top + container.scrollTop;
      },
      scrollToItem,
    };
  }, [footerHeight, itemIdentity, scrollToItem]);

  useImperativeHandle(ref, () => methods, [methods]);

  const contextValue = useMemo<MessageListContextValue<any, any>>(
    () => ({
      context,
      itemIdentity,
      location,
      methods,
      registerItemElement,
    }),
    [context, itemIdentity, location, methods, registerItemElement]
  );

  return (
    <MessageListContext.Provider
      value={contextValue as MessageListContextValue<unknown, unknown>}
    >
      <div
        data-testid="conversation-message-list"
        className={cn("relative flex h-full min-h-0 flex-col", className)}
      >
        {StickyHeader ? <StickyHeader context={context} /> : null}
        <div
          ref={scrollContainerRef}
          data-testid="conversation-scroll-container"
          className="min-h-0 flex-1 overflow-y-auto"
          onScroll={updateLocation}
        >
          <div
            className="flex flex-col gap-8 pt-4"
            style={{ paddingBottom: footerHeight + FOOTER_SPACER_PX }}
          >
            {items.length === 0 && EmptyPlaceholder ? (
              <EmptyPlaceholder />
            ) : null}
            {items.map((item, index) => {
              const key =
                computeItemKey?.({ context, data: item }) ?? itemIdentity(item);
              const identity = itemIdentity(item);
              return (
                <MeasureRow
                  key={key}
                  identity={identity}
                  registerItemElement={registerItemElement}
                >
                  <ItemContent
                    context={context}
                    data={item}
                    nextData={items[index + 1] ?? null}
                    prevData={items[index - 1] ?? null}
                  />
                </MeasureRow>
              );
            })}
          </div>
        </div>
        {StickyFooter ? (
          <div
            ref={footerRef}
            className="pointer-events-none absolute inset-x-0 bottom-0 z-20"
          >
            <div className="pointer-events-auto">
              <StickyFooter context={context} />
            </div>
          </div>
        ) : null}
      </div>
    </MessageListContext.Provider>
  );
}

export const VirtuosoMessageList = forwardRef(VirtuosoMessageListInner) as <
  TItem,
  TContext,
>(
  props: VirtuosoMessageListProps<TItem, TContext> & {
    ref?: React.ForwardedRef<VirtuosoMessageListMethods<TItem, TContext>>;
  }
) => React.ReactElement;

export const VirtuosoMessageListLicense = ({
  children,
}: {
  children: React.ReactNode;
  licenseKey?: string;
}) => <>{children}</>;
