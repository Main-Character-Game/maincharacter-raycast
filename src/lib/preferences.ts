import { getPreferenceValues } from "@raycast/api";

type ExtensionPreferences = {
  baseUrl: string;
  personalAccessToken: string;
};

export class PreferenceError extends Error {
  readonly preferenceName: "baseUrl" | "personalAccessToken";

  constructor(
    preferenceName: "baseUrl" | "personalAccessToken",
    message: string,
  ) {
    super(message);
    this.name = "PreferenceError";
    this.preferenceName = preferenceName;
  }
}

export type RuntimePreferences = {
  baseUrl: string;
  personalAccessToken: string;
};

export function getRuntimePreferences(): RuntimePreferences {
  const prefs = getPreferenceValues<ExtensionPreferences>();
  const baseUrl = prefs.baseUrl?.trim();
  const personalAccessToken = prefs.personalAccessToken?.trim();

  if (!baseUrl) {
    throw new PreferenceError(
      "baseUrl",
      "Set API Base URL in extension preferences.",
    );
  }

  let normalizedBaseUrl: URL;
  try {
    normalizedBaseUrl = new URL(baseUrl);
  } catch {
    throw new PreferenceError(
      "baseUrl",
      "API Base URL must be a valid absolute URL.",
    );
  }

  if (!personalAccessToken) {
    throw new PreferenceError(
      "personalAccessToken",
      "Set Personal Access Token in extension preferences.",
    );
  }

  return {
    baseUrl: normalizedBaseUrl.origin,
    personalAccessToken,
  };
}
