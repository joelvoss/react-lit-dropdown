import * as React from 'react';
import { Tooltip } from '@react-lit/tooltip';
import {
	DropdownProvider,
	DropdownTrigger,
	DropdownPopover,
	DropdownItems,
	DropdownItem,
} from '../../src/index';

export function Example() {
	const [action, actionSet] = React.useState('');

	return (
		<>
			<h2>Example: With Tooltip</h2>
			<div>
				<DropdownProvider>
					<Tooltip label="Tooltip label">
						<DropdownTrigger id="actions-button">
							Actions{' '}
							<span aria-hidden="true" style={{ userSelect: 'none' }}>
								▾
							</span>
						</DropdownTrigger>
					</Tooltip>
					<DropdownPopover>
						<DropdownItems>
							<DropdownItem onSelect={() => actionSet('Download')}>
								Download
							</DropdownItem>
							<DropdownItem onSelect={() => actionSet('Copy')}>
								Create a Copy
							</DropdownItem>
							<DropdownItem onSelect={() => actionSet('Mark as Draft')}>
								Mark as Draft
							</DropdownItem>
							<DropdownItem onSelect={() => actionSet('Delete')}>
								Delete
							</DropdownItem>
							<DropdownItem onSelect={() => actionSet('')}>Reset</DropdownItem>
							<hr />
							<DropdownItem as="a" isLink href="/">
								Go back
							</DropdownItem>
						</DropdownItems>
					</DropdownPopover>
				</DropdownProvider>

				<span style={{ marginLeft: 5 }}>Action selected: {action}</span>
			</div>
		</>
	);
}
