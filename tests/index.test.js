import * as React from 'react';
import { render, userEvent } from './test-utils';
import { axe } from 'jest-axe';

import {
	DropdownProvider,
	DropdownTrigger,
	DropdownPopover,
	DropdownItems,
	DropdownItem,
} from '../src/index';
import { act } from 'react-dom/test-utils';

describe('Dropdown', () => {
	const Comp = () => {
		const [selectedItem, selectedItemSet] = React.useState('');
		const handleSelect = item => {
			selectedItemSet(item);
		};

		return (
			<div>
				<DropdownProvider>
					<DropdownTrigger id="actions-button">
						Actions <span aria-hidden="true">▾</span>
					</DropdownTrigger>
					<DropdownPopover>
						<DropdownItems>
							<DropdownItem onSelect={() => handleSelect('item 1')}>
								Dropdown Item
							</DropdownItem>
							<hr />
							<DropdownItem isLink as="a" href="#">
								Dropdown Item Link
							</DropdownItem>
						</DropdownItems>
					</DropdownPopover>
				</DropdownProvider>
				<p data-testid="click-result">Selected item: {selectedItem}</p>
			</div>
		);
	};

	it('should not have ARIA violations', async () => {
		let { container, queryByText } = render(<Comp />);
		await act(async () => {
			expect(await axe(container)).toHaveNoViolations();
		});
		userEvent.click(queryByText(/Actions/i));
		await act(async () => {
			expect(await axe(container)).toHaveNoViolations();
		});
	});

	it('should render proper HTML', async () => {
		const { baseElement, queryByText } = render(<Comp />);
		expect(baseElement).toMatchSnapshot();
		userEvent.click(queryByText(/Actions/i));
		expect(baseElement).toMatchSnapshot();
	});
});
