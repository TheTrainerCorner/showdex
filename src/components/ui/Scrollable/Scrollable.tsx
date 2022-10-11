import * as React from 'react';
import SimpleBar from 'simplebar';
import cx from 'classnames';
import { useColorScheme } from '@showdex/redux/store';
// import type { Options as SimpleBarOptions } from 'simplebar';
import styles from './Scrollable.module.scss';

export interface ScrollableProps extends Omit<JSX.IntrinsicElements['div'], 'ref'> {
  scrollRef?: React.Ref<HTMLDivElement>;
  contentRef?: React.Ref<HTMLDivElement>;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

/**
 * Scrollable container that renders its own custom scrollbar when overflowing.
 *
 * * For the scrollbars to appear, you'll need to make sure a max height is enforced on the container.
 *   - No need to specify `overflow: auto` or `overflow: visible` since this component will automatically
 *     apply them for you when its content exceeds the max height of the container.
 *   - To enforce only vertical scrolling, apply `overflow-x: hidden`.
 * * This component exposes 3 different ref props:
 *   - `ref` is a reference to the container `HTMLDivElement` that the `SimpleBar` is applied to.
 *   - `scrollRef` is a reference to the `SimpleBar` scrollable content wrapper `HTMLDivElement` (`contentEl`).
 *   - `contentRef` is a reference to the `SimpleBar` content `HTMLDivElement` (`contentWrapper`).
 * * Uses `SimpleBar` under-the-hood.
 *   - Unlike traditional CSS-based overflow scrolling, `SimpleBar` does not overflow the container
 *     that contains all the `children`.
 *   - Instead, it renders all the `children` in a content container inside a content wrapper that
 *     actually performs the overflow scrolling. (Content container does not actually overflow.)
 *   - There are also a bunch of other `<div>`s that render the actual horizontal/vertical scrollbars
 *     and measures the height of the content container.
 *   - To programatically control the scroll position (e.g., `scrollTop`), you'll need to use the
 *     `scrollRef` (i.e., the content wrapper) instead of the `contentRef` (i.e., the content container).
 * * Essentially a reimplementation of `simplebar-react` since the component
 *   doesn't allow us to provide custom class names since it provides its own divs.
 *   - While the `SimpleBar` class (not React component) allows us to provide
 *     custom `classNames` under its `options` constructor argument, `simplebar-react`
 *     does not take these into account, resulting in double-rendered `SimpleBar`s.
 *   - Link below shows the hardcoded class names in `simplebar-react`.
 *
 * @see https://github.com/Grsmto/simplebar/blob/dba7414fe04ee70dca781b7b28557f65d3c204b6/packages/simplebar-react/index.js#L100-L129
 * @since 1.0.2
 */
export const Scrollable = React.forwardRef<HTMLDivElement, ScrollableProps>(({
  scrollRef: scrollRefFromProps,
  contentRef: contentRefFromProps,
  className,
  style,
  children,
  ...props
}: ScrollableProps, forwardedRef): JSX.Element => {
  const simpleBarRef = React.useRef<SimpleBar>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);

  React.useImperativeHandle(forwardedRef, () => containerRef.current);
  React.useImperativeHandle(scrollRefFromProps, () => scrollRef.current);
  React.useImperativeHandle(contentRefFromProps, () => contentRef.current);

  React.useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    simpleBarRef.current = new SimpleBar(containerRef.current, {
      scrollableNode: scrollRef.current,
      contentNode: contentRef.current,

      classNames: {
        contentEl: styles.content,
        contentWrapper: styles.contentWrapper,
        offset: styles.offset,
        mask: styles.mask,
        wrapper: styles.wrapper,
        placeholder: styles.placeholder,
        scrollbar: styles.scrollbar,
        track: styles.track,
        heightAutoObserverWrapperEl: styles.heightObserverWrapper,
        heightAutoObserverEl: styles.heightObserver,
        visible: styles.visible,
        horizontal: styles.horizontal,
        vertical: styles.vertical,
        hover: styles.hover,
        dragging: styles.dragging,
      },

      // note: not a good idea to make this into a prop
      scrollbarMinSize: 40,
    });

    // scrollRef.current = simpleBarRef.current.getScrollElement() as HTMLDivElement;
    // contentRef.current = simpleBarRef.current.getContentElement() as HTMLDivElement;

    return () => simpleBarRef.current?.unMount();
  }, []);

  const colorScheme = useColorScheme();

  // SimpleBar lets you define your own divs, as long as the classNames match up.
  // we just have to pass the refs to the scrolableNode and contentNode options.
  // (warning: requires SimpleBar patch-package to provide these untyped options!)

  // otherwise, SimpleBar will make its own divs, causing unsavory removeChild() errors
  // when the children prop changes -- React doesn't like it when a vanilla JS library
  // creates and removes its own elements, which SimpleBar will do if we don't provide
  // our own divs like we do below!

  return (
    <div
      ref={containerRef}
      {...props}
      className={cx(
        styles.container,
        !!colorScheme && styles[colorScheme],
        className,
      )}
      style={style}
      data-simplebar
    >
      {/* {children} */}

      <div className={styles.wrapper}>
        <div className={styles.heightObserverWrapper}>
          <div className={styles.heightObserver} />
        </div>

        <div className={styles.mask}>
          <div className={styles.offset}>
            <div
              ref={scrollRef}
              className={styles.contentWrapper}
            >
              <div
                ref={contentRef}
                className={styles.content}
              >
                {children}
              </div>
            </div>
          </div>
        </div>

        <div className={styles.placeholder} />
      </div>

      <div className={cx(styles.track, styles.horizontal)}>
        <div className={styles.scrollbar} />
      </div>

      <div className={cx(styles.track, styles.vertical)}>
        <div className={styles.scrollbar} />
      </div>
    </div>
  );

  // return (
  //   <SimpleBar
  //     ref={simpleBarRef}
  //     {...props}
  //     className={cx(
  //       !!colorScheme && styles[colorScheme],
  //       className,
  //     )}
  //     classNames={{
  //       contentEl: styles.content,
  //       contentWrapper: styles.contentWrapper,
  //       offset: styles.offset,
  //       mask: styles.mask,
  //       wrapper: styles.wrapper,
  //       placeholder: styles.placeholder,
  //       scrollbar: styles.scrollbar,
  //       track: styles.track,
  //       heightAutoObserverWrapperEl: styles.heightObserverWrapper,
  //       heightAutoObserverEl: styles.heightObserver,
  //       visible: styles.visible,
  //       horizontal: styles.horizontal,
  //       vertical: styles.vertical,
  //       hover: styles.hover,
  //       dragging: styles.dragging,
  //     }}
  //     // scrollableNodeProps={{
  //     //   ...scrollableNodeProps,
  //     //   ref: forwardedRef,
  //     // }}
  //   >
  //     {children}
  //   </SimpleBar>
  // );
});
