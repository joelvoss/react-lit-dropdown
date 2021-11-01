import {
	forwardRef,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useReducer,
	useRef,
	useState,
} from 'react';
import { useId } from '@react-lit/auto-id';
import { Popover } from '@react-lit/popover';
import {
	createDescendantContext,
	DescendantProvider,
	useDescendant,
	useDescendants,
	useDescendantsInit,
	useDescendantKeyDown,
} from '@react-lit/descendants';
import {
	isRightClick,
	usePrevious,
	getOwnerDocument,
	createNamedContext,
	isFunction,
	isString,
	makeId,
	useStatefulRefValue,
	useComposeRefs,
	composeEventHandlers,
} from '@react-lit/helper';

////////////////////////////////////////////////////////////////////////////////

/**
 * @typedef {Object} Descendant
 * @prop {Element | HTMLElement | null} element
 * @prop {number} index
 *
 * @typedef {Object} Dropdown
 * @prop {string} key
 * @prop {boolean} isLink
 * @prop {boolean} [disabled=]
 *
 * @typedef {Descendant & Dropdown} DropdownDescendants
 */

/**
 * @typedef {React.RefObject<null | HTMLElement>} TriggerRef
 * @typedef {React.RefObject<null | HTMLElement>} DropdownRef
 * @typedef {React.RefObject<null | HTMLElement>} PopoverRef
 */

/**
 * @typedef {Object} InternalDropdownContextValue
 * @prop {React.Dispatch<DropdownAction>} dispatch
 * @prop {string | undefined} dropdownId
 * @prop {DropdownRef} dropdownRef
 * @prop {React.MutableRefObject<{ x: number; y: number }>} mouseDownStartPosRef
 * @prop {PopoverRef} popoverRef
 * @prop {React.MutableRefObject<boolean>} readyToSelect
 * @prop {React.MutableRefObject<Array<(() => void)>>} selectCallbacks
 * @prop {DropdownState} state
 * @prop {React.MutableRefObject<boolean>} triggerClickedRef
 * @prop {TriggerRef} triggerRef
 */

/**
 * @typedef {Object} DropdownContextValue
 * @prop {boolean} isExpanded
 */

////////////////////////////////////////////////////////////////////////////////

const ActionType = {
	CLEAR_SELECTION_INDEX: 'CLEAR_SELECTION_INDEX',
	CLICK_MENU_ITEM: 'CLICK_MENU_ITEM',
	CLOSE_MENU: 'CLOSE_MENU',
	OPEN_MENU_AT_FIRST_ITEM: 'OPEN_MENU_AT_FIRST_ITEM',
	OPEN_MENU_AT_INDEX: 'OPEN_MENU_AT_INDEX',
	OPEN_MENU_CLEARED: 'OPEN_MENU_CLEARED',
	SEARCH_FOR_ITEM: 'SEARCH_FOR_ITEM',
	SELECT_ITEM_AT_INDEX: 'SELECT_ITEM_AT_INDEX',
	SET_BUTTON_ID: 'SET_BUTTON_ID',
};

const DropdownDescendantContext = createDescendantContext(
	'DropdownDescendantContext',
);
const DropdownContext = createNamedContext('DropdownContext', {});

/** @type {DropdownState} */
const initialState = {
	triggerId: null,
	isExpanded: false,
	typeaheadQuery: '',
	selectionIndex: -1,
};

////////////////////////////////////////////////////////////////////////////////

export const DropdownProvider = ({ id, children }) => {
	const triggerRef = useRef(null);
	const dropdownRef = useRef(null);
	const popoverRef = useRef(null);

	const [descendants, descendantsSet] = useDescendantsInit();

	const _id = useId(id);
	const dropdownId = id || makeId('menu', _id);
	const triggerId = makeId('menu-button', dropdownId);

	const [state, dispatch] = useReducer(reducer, {
		...initialState,
		triggerId,
	});

	// NOTE(joel): We use an event listener attached to the window to capture
	// outside clicks that close the dropdown. We don't want the initial button
	// click to trigger this when a dropdown is closed, so we can track this
	// behavior in a ref.
	const triggerClickedRef = useRef(false);

	// NOTE(joel): We will put children callbacks in a ref to avoid triggering
	// endless render loops when using render props if the app code doesn't
	// useCallback.
	const selectCallbacks = useRef([]);

	// NOTE(joel): If the popover's position overlaps with an option when the
	// popover initially opens, the mouseup event will trigger a select. To
	// prevent that, we decide the control is only ready to make a selection if
	// the pointer moves a certain distance OR if the mouse button is pressed for
	// a certain length of time, otherwise the user is just registering the
	// initial button click rather than selecting an item.
	const readyToSelect = useRef(false);
	const mouseDownStartPosRef = useRef({ x: 0, y: 0 });

	const context = {
		dispatch,
		dropdownId,
		dropdownRef,
		mouseDownStartPosRef,
		popoverRef,
		readyToSelect,
		selectCallbacks,
		state,
		triggerClickedRef,
		triggerRef,
	};

	// NOTE(joel): When the dropdown is open, focus is placed on the dropdown
	// itself so that keyboard navigation is still possible.
	useEffect(() => {
		if (state.isExpanded) {
			window.__REACT_LIT_DISABLE_TOOLTIPS = true;
			window.requestAnimationFrame(() => {
				focus(dropdownRef.current);
			});
		} else {
			// NOTE(joel): We want to ignore the immediate focus of a tooltip so it
			// doesn't pop up again when the dropdown closes, only pops up when focus
			// returns again to the tooltip (like native OS tooltips).
			window.__REACT_LIT_DISABLE_TOOLTIPS = false;
		}
	}, [state.isExpanded]);

	return (
		<DescendantProvider
			context={DropdownDescendantContext}
			items={descendants}
			set={descendantsSet}
		>
			<DropdownContext.Provider value={context}>
				{isFunction(children)
					? children({
							isExpanded: state.isExpanded,
					  })
					: children}
			</DropdownContext.Provider>
		</DescendantProvider>
	);
};

////////////////////////////////////////////////////////////////////////////////

export function useDropdownTrigger({
	onKeyDown,
	onMouseDown,
	id,
	ref: parentRef,
	...props
}) {
	const {
		dispatch,
		dropdownId,
		mouseDownStartPosRef,
		triggerClickedRef,
		triggerRef,
		state: { triggerId, isExpanded },
	} = useDropdownContext();

	const ref = useComposeRefs(triggerRef, parentRef);
	const items = useDropdownDescendants();

	const firstNonDisabledIndex = useMemo(
		() => items.findIndex(item => !item.disabled),
		[items],
	);

	useEffect(() => {
		if (id != null && id !== triggerId) {
			dispatch({
				type: ActionType.SET_BUTTON_ID,
				payload: id,
			});
		}
	}, [triggerId, dispatch, id]);

	/**
	 * handleKeyDown
	 * @param {React.KeyboardEvent} event
	 */
	function handleKeyDown(event) {
		switch (event.key) {
			case 'ArrowDown':
			case 'ArrowUp':
				// NOTE(joel): Prevent scroll.
				event.preventDefault();
				dispatch({
					type: ActionType.OPEN_MENU_AT_INDEX,
					payload: { index: firstNonDisabledIndex },
				});
				break;
			case 'Enter':
			case ' ':
				dispatch({
					type: ActionType.OPEN_MENU_AT_INDEX,
					payload: { index: firstNonDisabledIndex },
				});
				break;
			default:
				break;
		}
	}

	/**
	 * handleMouseDown
	 * @param {React.MouseEvent} event
	 */
	function handleMouseDown(event) {
		if (isRightClick(event.nativeEvent)) return;

		mouseDownStartPosRef.current = { x: event.clientX, y: event.clientY };

		if (!isExpanded) {
			triggerClickedRef.current = true;
		}

		if (isExpanded) {
			dispatch({ type: ActionType.CLOSE_MENU });
		} else {
			dispatch({ type: ActionType.OPEN_MENU_CLEARED });
		}
	}

	return {
		data: { isExpanded, controls: dropdownId },
		props: {
			...props,
			ref,
			id: triggerId || undefined,
			onKeyDown: composeEventHandlers(onKeyDown, handleKeyDown),
			onMouseDown: composeEventHandlers(onMouseDown, handleMouseDown),
			type: 'button',
		},
	};
}

////////////////////////////////////////////////////////////////////////////////

export const DropdownTrigger = forwardRef(
	({ as: Comp = 'button', ...rest }, parentRef) => {
		let { props } = useDropdownTrigger({ ...rest, ref: parentRef });
		return <Comp {...props} />;
	},
);

////////////////////////////////////////////////////////////////////////////////

export function useDropdownItem({
	index: indexProp,
	isLink = false,
	onClick,
	onDragStart,
	onMouseDown,
	onMouseEnter,
	onMouseLeave,
	onMouseMove,
	onMouseUp,
	onSelect,
	disabled,
	onFocus,
	valueText: valueTextProp,
	ref: parentRef,
	...props
}) {
	const {
		dispatch,
		dropdownRef,
		mouseDownStartPosRef,
		readyToSelect,
		selectCallbacks,
		triggerRef,
		state: { selectionIndex, isExpanded },
	} = useDropdownContext();

	const ownRef = useRef(null);
	const mouseEventStarted = useRef(false);

	// After the ref is mounted to the DOM node, we check to see if we have an
	// explicit valueText prop before looking for the node's textContent for
	// typeahead functionality.
	const [valueText, valueTextSet] = useState(valueTextProp || '');
	const setValueTextFromDOM = useCallback(
		node => {
			if (!valueTextProp && node?.textContent) {
				valueTextSet(node.textContent);
			}
		},
		[valueTextProp],
	);

	const [element, handleRefSet] = useStatefulRefValue(ownRef, null);
	const ref = useComposeRefs(parentRef, handleRefSet, setValueTextFromDOM);

	const descendant = useMemo(
		() => ({
			element,
			key: valueText,
			disabled,
			isLink,
		}),
		[disabled, element, isLink, valueText],
	);
	const index = useDescendant(descendant, DropdownDescendantContext, indexProp);

	const isSelected = index === selectionIndex && !disabled;

	// NOTE(joel): Update the callback ref array on every render.
	selectCallbacks.current[index] = onSelect;

	function select() {
		focus(triggerRef.current);
		onSelect && onSelect();
		dispatch({ type: ActionType.CLICK_MENU_ITEM });
	}

	/**
	 * handleClick
	 * @param {React.MouseEvent} event
	 */
	function handleClick(event) {
		if (isRightClick(event.nativeEvent) || !isLink) return;

		if (disabled) {
			event.preventDefault();
		} else {
			select();
		}
	}

	/**
	 * handleDragStart prevents dragstart events on links, because we don't
	 * preventDefault on mousedown (we need the native click event) and clicking
	 * and holding on a link triggers it.
	 * @param {React.MouseEvent} event
	 */
	function handleDragStart(event) {
		if (!isLink) return;
		event.preventDefault();
	}

	/**
	 * handleMouseDown
	 * @param {React.MouseEvent} event
	 */
	function handleMouseDown(event) {
		if (isRightClick(event.nativeEvent)) return;

		if (isLink) {
			// NOTE(joel): Flag that the mouse is down so we can call the right
			// function if the user is clicking on a link.
			mouseEventStarted.current = true;
		} else {
			event.preventDefault();
		}
	}

	/**
	 * handleMouseEnter
	 */
	function handleMouseEnter() {
		const doc = getOwnerDocument(dropdownRef.current);
		if (!isSelected && index != null && !disabled) {
			if (
				dropdownRef?.current &&
				dropdownRef.current !== doc.activeElement &&
				ownRef.current !== doc.activeElement
			) {
				dropdownRef.current.focus();
			}

			dispatch({
				type: ActionType.SELECT_ITEM_AT_INDEX,
				payload: { index },
			});
		}
	}

	/**
	 * handleMouseLeave clears out selection when we mouse over a
	 * non-dropdown-item child.
	 */
	function handleMouseLeave() {
		dispatch({ type: ActionType.CLEAR_SELECTION_INDEX });
	}

	/**
	 * handleMouseMove
	 * @param {React.MouseEvent} event
	 */
	function handleMouseMove(event) {
		if (!readyToSelect.current) {
			const threshold = 8;
			const deltaX = Math.abs(event.clientX - mouseDownStartPosRef.current.x);
			const deltaY = Math.abs(event.clientY - mouseDownStartPosRef.current.y);
			if (deltaX > threshold || deltaY > threshold) {
				readyToSelect.current = true;
			}
		}
		if (!isSelected && index != null && !disabled) {
			dispatch({
				type: ActionType.SELECT_ITEM_AT_INDEX,
				payload: {
					index,
					dropdownRef,
				},
			});
		}
	}

	/**
	 * handleFocus
	 */
	function handleFocus() {
		readyToSelect.current = true;
		if (!isSelected && index != null && !disabled) {
			dispatch({
				type: ActionType.SELECT_ITEM_AT_INDEX,
				payload: {
					index,
				},
			});
		}
	}

	/**
	 * handleMouseUp
	 * @param {React.MouseEvent} event
	 */
	function handleMouseUp(event) {
		if (isRightClick(event.nativeEvent)) return;

		if (!readyToSelect.current) {
			readyToSelect.current = true;
			return;
		}

		if (isLink) {
			// NOTE(joel): If a mousedown event was initiated on a link item followed
			// by a mouseup event on the same link, we do nothing; a click event will
			// come next and handle selection. Otherwise, we trigger a click event.
			if (mouseEventStarted.current) {
				mouseEventStarted.current = false;
			} else if (ownRef.current) {
				ownRef.current.click();
			}
		} else if (!disabled) {
			select();
		}
	}

	// NOTE(joel): When the dropdown opens, wait for about half a second
	// before enabling selection. This is designed to mirror dropdown menus
	// on macOS, where opening a menu on top of a trigger would otherwise
	// result in an immediate accidental selection once the click trigger is
	// released.
	useEffect(() => {
		if (isExpanded) {
			const id = window.setTimeout(() => {
				readyToSelect.current = true;
			}, 400);

			return () => {
				window.clearTimeout(id);
			};
		}
		// NOTE(joel): When the dropdown closes, reset readyToSelect for the next
		// interaction.
		readyToSelect.current = false;
	}, [isExpanded, readyToSelect]);

	// NOTE(joel): Any time a mouseup event occurs anywhere in the document, we
	// reset the `mouseEventStarted` ref so we can check it again when needed.
	useEffect(() => {
		function listener() {
			mouseEventStarted.current = false;
		}

		const ownerDocument = getOwnerDocument(ownRef.current);
		ownerDocument.addEventListener('mouseup', listener);
		return () => {
			ownerDocument.removeEventListener('mouseup', listener);
		};
	}, []);

	return {
		data: {
			disabled,
		},
		props: {
			id: useItemId(index),
			tabIndex: -1,
			...props,
			ref,
			'data-disabled': disabled ? '' : undefined,
			'data-selected': isSelected ? '' : undefined,
			'data-valuetext': valueText,
			onClick: composeEventHandlers(onClick, handleClick),
			onDragStart: composeEventHandlers(onDragStart, handleDragStart),
			onMouseDown: composeEventHandlers(onMouseDown, handleMouseDown),
			onMouseEnter: composeEventHandlers(onMouseEnter, handleMouseEnter),
			onMouseLeave: composeEventHandlers(onMouseLeave, handleMouseLeave),
			onMouseMove: composeEventHandlers(onMouseMove, handleMouseMove),
			onFocus: composeEventHandlers(onFocus, handleFocus),
			onMouseUp: composeEventHandlers(onMouseUp, handleMouseUp),
		},
	};
}

////////////////////////////////////////////////////////////////////////////////

export const DropdownItem = forwardRef(
	({ as: Comp = 'div', style, ...rest }, parentRef) => {
		const { props } = useDropdownItem({ ...rest, ref: parentRef });
		const { 'data-selected': dataSelected, 'data-disabled': dataDisabled } =
			props;

		return (
			<Comp
				style={{
					display: 'block',
					userSelect: 'none',
					cursor: 'pointer',
					padding: '5px 20px',
					...(dataSelected != null
						? {
								background: 'hsla(211, 81%, 36%, 1)',
								color: 'hsla(0, 100%, 100%, 1)',
								outline: 'none',
						  }
						: {}),
					...(dataDisabled != null
						? {
								opacity: '0.5',
								cursor: 'not-allowed',
						  }
						: {}),
					...style,
				}}
				{...props}
			/>
		);
	},
);

////////////////////////////////////////////////////////////////////////////////

export function useDropdownItems({ id, onKeyDown, ref: parentRef, ...props }) {
	const {
		dispatch,
		triggerRef,
		dropdownRef,
		selectCallbacks,
		dropdownId,
		state: { isExpanded, triggerId, selectionIndex, typeaheadQuery },
	} = useDropdownContext();

	const items = useDropdownDescendants();
	const ref = useComposeRefs(dropdownRef, parentRef);

	// NOTE(joel): Handle responing to char input changes by the user with our
	// typeahead functionality, e.g. the user starts typing when the dropdown is
	// focused to search for a specific dropdown item.
	useEffect(() => {
		const match = findItemFromTypeahead(items, typeaheadQuery);
		if (typeaheadQuery && match != null) {
			dispatch({
				type: ActionType.SELECT_ITEM_AT_INDEX,
				payload: {
					index: match,
					dropdownRef,
				},
			});
		}

		// NOTE(joel): Reset after one second.
		const timeout = window.setTimeout(
			() =>
				typeaheadQuery &&
				dispatch({ type: ActionType.SEARCH_FOR_ITEM, payload: '' }),
			1000,
		);
		return () => window.clearTimeout(timeout);
	}, [dispatch, items, typeaheadQuery, dropdownRef]);

	const prevItemsLength = usePrevious(items.length);
	const prevSelected = usePrevious(items[selectionIndex]);
	const prevSelectionIndex = usePrevious(selectionIndex);

	// NOTE(joel): Sync changes to the selection index in state and handle all
	// known edge cases.
	useEffect(() => {
		if (selectionIndex > items.length - 1) {
			// NOTE(joel): Edge case - If for some reason our selection index is
			// larger than our possible index range (e.g. the last item is selected
			// and the list dynamically changes), we need to re-select the last item
			// in the list again.
			dispatch({
				type: ActionType.SELECT_ITEM_AT_INDEX,
				payload: {
					index: items.length - 1,
					dropdownRef,
				},
			});
		} else if (
			// NOTE(joel): We check if the item length has changed or the selection
			// index has not changed BUT selected item has changed.
			// This should prevent any dynamic adding or removing of items from
			// actually chaning a user's expected selection.
			prevItemsLength !== items.length &&
			selectionIndex > -1 &&
			prevSelected &&
			prevSelectionIndex === selectionIndex &&
			items[selectionIndex] !== prevSelected
		) {
			dispatch({
				type: ActionType.SELECT_ITEM_AT_INDEX,
				payload: {
					index: items.findIndex(i => i.key === prevSelected?.key),
					dropdownRef,
				},
			});
		}
	}, [
		dropdownRef,
		dispatch,
		items,
		prevItemsLength,
		prevSelected,
		prevSelectionIndex,
		selectionIndex,
	]);

	const handleKeyDown = composeEventHandlers(
		/**
		 * handleKeyDown
		 * @param {React.KeyboardEvent} event
		 */
		event => {
			const { key } = event;

			if (!isExpanded) return;

			switch (key) {
				case 'Enter':
				case ' ': {
					const selected = items.find(item => item.index === selectionIndex);
					// For links, the Enter key will trigger a click by default, but for
					// consistent behavior across items we'll trigger a click when the
					// spacebar is pressed.
					if (selected && !selected.disabled) {
						event.preventDefault();
						if (selected.isLink && selected.element) {
							selected.element.click();
						} else {
							// Focus the button first by default when an item is selected.
							// We fire the onSelect callback next so the app can manage
							// focus if needed.
							focus(triggerRef.current);
							selectCallbacks.current[selected.index] &&
								selectCallbacks.current[selected.index]();
							dispatch({ type: ActionType.CLICK_MENU_ITEM });
						}
					}
					break;
				}
				case 'Escape': {
					focus(triggerRef.current);
					dispatch({ type: ActionType.CLOSE_MENU });
					break;
				}
				case 'Tab': {
					// NOTE(joel): Prevent leaving.
					event.preventDefault();
					break;
				}
				default: {
					// Check if a user is typing some char keys and respond by setting
					// the query state.
					if (isString(key) && key.length === 1) {
						const query = typeaheadQuery + key.toLowerCase();
						dispatch({
							type: ActionType.SEARCH_FOR_ITEM,
							payload: query,
						});
					}
					break;
				}
			}
		},
		useDescendantKeyDown(DropdownDescendantContext, {
			currentIndex: selectionIndex,
			orientation: 'vertical',
			rotate: false,
			filter: item => !item.disabled,
			callback: index => {
				dispatch({
					type: ActionType.SELECT_ITEM_AT_INDEX,
					payload: {
						index,
						dropdownRef,
					},
				});
			},
			key: 'index',
		}),
	);

	return {
		data: {
			activeDescendant: useItemId(selectionIndex) || undefined,
			triggerId,
		},
		props: {
			tabIndex: -1,
			...props,
			ref,
			id: dropdownId,
			onKeyDown: composeEventHandlers(onKeyDown, handleKeyDown),
		},
	};
}

////////////////////////////////////////////////////////////////////////////////

export const DropdownItems = forwardRef(
	({ as: Comp = 'div', ...rest }, parentRef) => {
		const { props } = useDropdownItems({ ...rest, ref: parentRef });
		return (
			<Comp
				style={{
					display: 'block',
					whiteSpace: 'nowrap',
					border: 'solid 1px hsla(0, 0%, 0%, 0.25)',
					background: 'hsla(0, 100%, 100%, 1)',
				}}
				{...props}
			/>
		);
	},
);

////////////////////////////////////////////////////////////////////////////////

export function useDropdownPopover({
	onBlur,
	portal = true,
	position,
	ref: parentRef,
	...props
}) {
	let {
		triggerRef,
		triggerClickedRef,
		dispatch,
		dropdownRef,
		popoverRef,
		state: { isExpanded },
	} = useDropdownContext();

	let ref = useComposeRefs(popoverRef, parentRef);

	useEffect(() => {
		if (!isExpanded) {
			return;
		}

		let ownerDocument = getOwnerDocument(popoverRef.current);

		/**
		 * listener
		 * @param {MouseEvent | TouchEvent} event
		 */
		function listener(event) {
			if (triggerClickedRef.current) {
				triggerClickedRef.current = false;
			} else if (
				!popoverContainsEventTarget(popoverRef.current, event.target)
			) {
				// NOTE(joel): We on want to close only if focus rests outside the
				// dropdown.
				dispatch({ type: ActionType.CLOSE_MENU });
			}
		}
		ownerDocument.addEventListener('mousedown', listener);
		return () => {
			ownerDocument.removeEventListener('mousedown', listener);
		};
	}, [
		triggerClickedRef,
		triggerRef,
		dispatch,
		dropdownRef,
		popoverRef,
		isExpanded,
	]);

	return {
		data: {
			portal,
			position,
			targetRef: triggerRef,
			isExpanded,
		},
		props: {
			ref,
			hidden: !isExpanded,
			onBlur: composeEventHandlers(onBlur, event => {
				if (event.currentTarget.contains(event.relatedTarget)) {
					return;
				}
				dispatch({ type: ActionType.CLOSE_MENU });
			}),
			...props,
		},
	};
}

////////////////////////////////////////////////////////////////////////////////

export const DropdownPopover = forwardRef(
	({ as: Comp = 'div', style, ...rest }, parentRef) => {
		const { data, props } = useDropdownPopover({ ...rest, ref: parentRef });

		const { portal, targetRef, position } = data;
		const { hidden } = props;

		const sharedStyle = {
			display: hidden ? 'none' : 'block',
			position: 'absolute',
			...style,
		};

		return portal ? (
			<Popover
				{...props}
				style={sharedStyle}
				as={Comp}
				targetRef={targetRef}
				position={position}
			/>
		) : (
			<Comp {...props} style={sharedStyle} />
		);
	},
);

////////////////////////////////////////////////////////////////////////////////

/**
 * findItemFromTypeahead is our matching function for typeahead functionality.
 * @param {DropdownDescendant[]} items
 * @param {string} [string=""]
 * @returns
 */
function findItemFromTypeahead(items, string = '') {
	if (!string) {
		return null;
	}

	let found = items.find(item =>
		item.disabled
			? false
			: item.element?.dataset?.valuetext?.toLowerCase().startsWith(string),
	);
	return found ? items.indexOf(found) : null;
}

/**
 * useItemId
 * @param {number | null} index
 * @returns {string | undefined}
 */
function useItemId(index) {
	let { dropdownId } = useContext(DropdownContext);
	return index != null && index > -1
		? makeId(`option-${index}`, dropdownId)
		: undefined;
}

/**
 *
 * @param {HTMLElement | undefined | null} element
 */
function focus(element) {
	element && element.focus();
}

////////////////////////////////////////////////////////////////////////////////

/**
 * popoverContainsEventTarget
 * @param {HTMLElement | null} popover
 * @param {HTMLElement | EventTarget | null} target
 * @returns {boolean}
 */
function popoverContainsEventTarget(popover, target) {
	return !!(popover && popover.contains(target));
}

////////////////////////////////////////////////////////////////////////////////

/**
 * @typedef {Object} DropdownState
 * @prop {boolean} isExpanded
 * @prop {number} selectionIndex
 * @prop {null | string} triggerId
 * @prop {string} typeaheadQuery
 */

/**
 * @typedef {Object} DropdownActionPayload
 * @prop {number} index
 * @prop {React.RefObject<HTMLElement | null>} [dropdownRef=]
 * @prop {number} [min=]
 * @prop {number} [max=]
 */

/**
 * @typedef {Object} DropdownAction
 * @prop {keyof Actions} type
 * @prop {DropdownActionPayload} payload
 */

/**
 *
 * @param {DropdownState} state
 * @param {DropdownAction} [action={}]
 * @returns {DropdownState}
 */
function reducer(state, action = {}) {
	switch (action.type) {
		case ActionType.CLICK_MENU_ITEM:
			return {
				...state,
				isExpanded: false,
				selectionIndex: -1,
			};
		case ActionType.CLOSE_MENU:
			return {
				...state,
				isExpanded: false,
				selectionIndex: -1,
			};
		case ActionType.OPEN_MENU_AT_FIRST_ITEM:
			return {
				...state,
				isExpanded: true,
				selectionIndex: 0,
			};
		case ActionType.OPEN_MENU_AT_INDEX:
			return {
				...state,
				isExpanded: true,
				selectionIndex: action.payload.index,
			};
		case ActionType.OPEN_MENU_CLEARED:
			return {
				...state,
				isExpanded: true,
				selectionIndex: -1,
			};
		case ActionType.SELECT_ITEM_AT_INDEX: {
			let { dropdownRef = { current: null } } = action.payload;
			if (
				action.payload.index >= 0 &&
				action.payload.index !== state.selectionIndex
			) {
				if (dropdownRef.current) {
					let doc = getOwnerDocument(dropdownRef.current);
					if (dropdownRef.current !== doc?.activeElement) {
						dropdownRef.current.focus();
					}
				}

				return {
					...state,
					selectionIndex:
						action.payload.max != null
							? Math.min(Math.max(action.payload.index, 0), action.payload.max)
							: Math.max(action.payload.index, 0),
				};
			}
			return state;
		}
		case ActionType.CLEAR_SELECTION_INDEX:
			return {
				...state,
				selectionIndex: -1,
			};
		case ActionType.SET_BUTTON_ID:
			return {
				...state,
				triggerId: action.payload,
			};
		case ActionType.SEARCH_FOR_ITEM:
			if (typeof action.payload !== 'undefined') {
				return {
					...state,
					typeaheadQuery: action.payload,
				};
			}
			return state;
		default:
			return state;
	}
}

////////////////////////////////////////////////////////////////////////////////

/**
 * useDropdownContext
 * @returns {React.Context<DropdownContextValue>}
 */
export function useDropdownContext() {
	return useContext(DropdownContext);
}

////////////////////////////////////////////////////////////////////////////////

/**
 * useDropdownDescendants
 * @returns {Array<Descendant>}
 */
export function useDropdownDescendants() {
	return useDescendants(DropdownDescendantContext);
}
