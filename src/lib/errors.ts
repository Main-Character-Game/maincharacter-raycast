import { ApiError, NetworkError } from "../api/client";
import { FormValidationError } from "./validation";
import { PreferenceError } from "./preferences";

export type UserFacingError = {
  title: string;
  message: string;
  openPreferences?: boolean;
};

export function toUserFacingError(error: unknown): UserFacingError {
  if (error instanceof PreferenceError) {
    return {
      title: "Setup Required",
      message: error.message,
      openPreferences: true,
    };
  }

  if (error instanceof FormValidationError) {
    return {
      title: "Can’t Create Task",
      message: error.message,
    };
  }

  if (error instanceof NetworkError) {
    return {
      title: "Couldn’t Create Task",
      message: "Couldn’t reach Main Character. Try again.",
    };
  }

  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) {
      return {
        title: "Authentication Failed",
        message: "Token invalid, revoked, expired, or missing required scope.",
      };
    }

    if (error.status === 429) {
      return {
        title: "Rate Limited",
        message: "Too many requests. Wait a moment and try again.",
      };
    }

    if (error.status === 400) {
      return {
        title: "Invalid Task",
        message: error.message,
      };
    }

    return {
      title: "Couldn’t Create Task",
      message: error.message,
    };
  }

  return {
    title: "Couldn’t Create Task",
    message: "Unexpected error. Try again.",
  };
}
