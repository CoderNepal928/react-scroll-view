import styles from './styles';
import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { isIOS, debounce } from './util';
import Observer from './Observer';
import Intersection from './Intersection';
import RefreshControl from './RefreshControl';
import { ObserverContext } from './Contexts';
import warning from 'warning';

// TODO: should add [stickyheaderindices](https://facebook.github.io/react-native/docs/scrollview.html#stickyheaderindices) support

export default class ScrollView extends Component {
	static propTypes = {
		style: PropTypes.object,
		children: PropTypes.node,
		onScrollStart: PropTypes.func,
		onScroll: PropTypes.func,
		onScrollEnd: PropTypes.func,
		onEndReached: PropTypes.func,
		onTouchStart: PropTypes.func,
		onTouchMove: PropTypes.func,
		onTouchEnd: PropTypes.func,
		endReachedThreshold: PropTypes.number,
		isHorizontal: PropTypes.bool,
		innerRef: PropTypes.func,
		throttle: PropTypes.number,
		disabled: PropTypes.bool,
		onRefresh: PropTypes.func,
		isRefreshing: PropTypes.bool,
		refreshControlColor: PropTypes.string,
		refreshControlStyle: PropTypes.object,
	};

	static defaultProps = {
		throttle: 0,
		endReachedThreshold: 0,
		isHorizontal: false,
		disabled: false,
		isRefreshing: false,
		refreshControlColor: '#333',
	};

	constructor(props) {
		super(props);

		const { isHorizontal, onEndReached, onRefresh } = props;

		warning(
			!isHorizontal || !onRefresh,
			'`onRefresh` with `isHorizontal` is NOT supported, `onRefresh` will be ignored',
		);

		warning(
			!isHorizontal || !onEndReached,
			'`onEndReached` with `isHorizontal` is NOT supported, `onEndReached` will be ignored',
		);

		this.observer = new Observer();
		this.toEmitOnScrollEnd = debounce((ev) => {
			const { onScrollEnd } = this.props;
			this.isScrolling = false;
			onScrollEnd && onScrollEnd(ev);
		}, 100);
	}

	componentDidMount() {
		const { dom, props: { throttle } } = this;
		this.observer.mount(dom, throttle);
		this.observeEndReached();
	}

	componentDidUpdate(prevProps) {
		const { onEndReached, isRefreshing } = this.props;
		if (onEndReached !== prevProps.onEndReached) {
			if (onEndReached) this.observeEndReached();
			else this.unobserveEndReached();
		}
		if (prevProps.isRefreshing && !isRefreshing) {
			const { refreshControl } = this;
			if (refreshControl) {
				refreshControl.end();
				refreshControl.setHeight(0);
			}
		}
	}

	componentWillUnmount() {
		this.toEmitOnScrollEnd.clearDebounce();
	}

	overflowStyle = styles.vertical.main.overflowY;

	scrollViewRef = (dom) => {
		const { innerRef } = this.props;
		innerRef && innerRef(dom);
		this.dom = dom;
	};

	endRef = (dom) => {
		this.end = dom;
	};

	refreshControlRef = (refreshControl) => {
		this.refreshControl = refreshControl;
	};

	observeEndReached() {
		const { end, props: { onEndReached } } = this;
		if (end && onEndReached) {
			const intersection = new Intersection({ onEnter: onEndReached });
			this.observer.observe(end, intersection);
		}
	}

	unobserveEndReached() {
		const { end } = this;
		if (end) this.observer.unobserve(end);
	}

	handleScroll = (ev) => {
		const { props: { onScrollStart, onScroll }, isScrolling } = this;
		this.observer.updateDirection(ev);
		if (!isScrolling) {
			this.isScrolling = true;
			onScrollStart && onScrollStart(ev);
		}
		onScroll && onScroll(ev);
		this.toEmitOnScrollEnd(ev);
	};

	handleTouchStart = (ev) => {
		const { onTouchStart, onRefresh } = this.props;
		onTouchStart && onTouchStart(ev);
		if (!onRefresh) return;
		if (this.dom.scrollTop <= 0) {
			this.y0 = ev.touches[0].clientY;
		}
	};

	handleTouchMove = (ev) => {
		const { onTouchMove, onRefresh } = this.props;
		onTouchMove && onTouchMove(ev);
		if (!onRefresh) return;
		if (this.y0) {
			const dy = ev.touches[0].clientY - this.y0;
			if (dy > 0 && !this.isPullingDown) {
				this.refreshControl.start();
				this.dom.style.overflowY = 'hidden';
				this.isPullingDown = true;
			}
			else if (dy <= 0 && this.isPullingDown) {
				this.refreshControl.setHeight(0);
				this.dom.style.overflowY = this.overflowStyle;
				this.isPullingDown = false;
			}
			if (this.isPullingDown) {
				this.refreshControl.setHeight(dy);
			}
		}
	};

	handleTouchEnd = (ev) => {
		const { onTouchEnd, onRefresh, isRefreshing } = this.props;
		onTouchEnd && onTouchEnd(ev);
		if (!onRefresh) return;
		this.y0 = null;
		if (isRefreshing || this.isPullingDown) {
			const { refreshControl } = this;
			if (!isRefreshing && refreshControl.shouldRefresh) {
				onRefresh();
			}
			refreshControl.end();
			if (isRefreshing || refreshControl.shouldRefresh) {
				refreshControl.show();
			}
			else {
				refreshControl.setHeight(0);
			}
			this.dom.style.overflowY = this.overflowStyle;
			this.isPullingDown = false;
		}
	};

	render() {
		const {
			props: {
				style,
				children,
				onScrollStart,
				onScrollEnd,
				onEndReached,
				endReachedThreshold,
				isHorizontal,
				onRefresh,
				throttle,
				disabled,
				isRefreshing,
				refreshControlColor,
				refreshControlStyle,
				...other
			},
			observer,
		} = this;
		const direction = isHorizontal ? 'horizontal' : 'vertical';
		const styled = { ...styles[direction].main, ...style };
		if (disabled) styled.overflow = 'hidden';
		return (
			<ObserverContext.Provider value={observer}>
				<div
					{...other}
					style={styled}
					ref={this.scrollViewRef}
					onScroll={this.handleScroll}
					onTouchStart={this.handleTouchStart}
					onTouchMove={this.handleTouchMove}
					onTouchEnd={this.handleTouchEnd}
				>
					{!isHorizontal &&
						onRefresh && (
						<RefreshControl
							ref={this.refreshControlRef}
							isRefreshing={isRefreshing}
							color={refreshControlColor}
							style={refreshControlStyle}
						/>
					)}
					{children}
					{isIOS && <div style={styles[direction].background} />}
					{!isHorizontal && (
						<div
							ref={this.endRef}
							style={{
								top: -endReachedThreshold,
								position: 'relative',
							}}
						/>
					)}
				</div>
			</ObserverContext.Provider>
		);
	}
}
