# @react-lit/dropdown

A React dropdown menu.

## Installation

```bash
$ npm i @react-lit/dropdown
# or
$ yarn add @react-lit/dropdown
```

## Example

```js
import * as React from 'react';
import {
  DropdownProvider,
  DropdownItem,
  DropdownItems,
  DropdownPopover,
  DropdownTrigger,
} from "@react-lit/dropdown";

function Example() {
  return (
    <div>
      <DropdownProvider>
        <DropdownTrigger id="actions-button">
          Actions{" "}
          <span aria-hidden="true" style={{ userSelect: "none" }}>
            ▾
          </span>
        </DropdownTrigger>
        <DropdownPopover>
          <DropdownItems>
            <DropdownItem onSelect={action("Download")}>Download</DropdownItem>
            <DropdownItem onSelect={action("Copy")}>Create a Copy</DropdownItem>
            <DropdownItem onSelect={action("Mark as Draft")}>
              Mark as Draft
            </DropdownItem>
            <DropdownItem onSelect={action("Delete")}>Delete</DropdownItem>
          </DropdownItems>
        </DropdownPopover>
      </DropdownProvider>
    </div>
  );
}
```

## Development

(1) Install dependencies

```bash
$ npm i
# or
$ yarn
```

(2) Run initial validation

```bash
$ ./Taskfile.sh validate
```

(3) Run tests in watch-mode to validate functionality.

```bash
$ ./Taskfile test -w
```

---

_This project was set up by @jvdx/core_
