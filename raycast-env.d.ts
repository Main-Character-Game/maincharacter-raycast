/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** API Base URL - Main Character base URL */
  "baseUrl": string,
  /** Personal Access Token - PAT with TASK_CREATE scope */
  "personalAccessToken": string
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `quick-add-task` command */
  export type QuickAddTask = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `quick-add-task` command */
  export type QuickAddTask = {
  /** Optional title prefill */
  "title": string
}
}

