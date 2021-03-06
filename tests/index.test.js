import * as React from 'react';
import { render, userEvent } from './test-utils';

import {
	DropdownProvider,
	DropdownTrigger,
	DropdownPopover,
	DropdownItems,
	DropdownItem,
} from '../src/index';

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
		await expect(container).toHaveNoAxeViolations();

		await userEvent.click(queryByText(/Actions/i));
		await expect(container).toHaveNoAxeViolations();
	});

	it('should render proper HTML', async () => {
		const { baseElement, queryByText } = render(<Comp />);
		expect(baseElement).toMatchSnapshot();
		await userEvent.click(queryByText(/Actions/i));
		expect(baseElement).toMatchSnapshot();
	});
});
