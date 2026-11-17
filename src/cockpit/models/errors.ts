export class CockpitError extends Error {
  override readonly name: string = "CockpitError";
}

export class InvalidWindowSettingsError extends CockpitError {
  override readonly name: string = "InvalidWindowSettingsError";
}

export class SessionBridgeMissingError extends CockpitError {
  override readonly name: string = "SessionBridgeMissingError";
}
