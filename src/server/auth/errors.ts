export class UnauthorizedError extends Error {
  constructor() { super("Unauthorized"); this.name = "UnauthorizedError"; }
}

export class ForbiddenError extends Error {
  constructor() { super("Forbidden"); this.name = "ForbiddenError"; }
}

export type SubscriptionReason = "none" | "expired" | "suspended";

export class SubscriptionError extends Error {
  reason: SubscriptionReason;
  constructor(reason: SubscriptionReason) {
    super(`Subscription check failed: ${reason}`);
    this.name = "SubscriptionError";
    this.reason = reason;
  }
}
